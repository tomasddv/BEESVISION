from __future__ import annotations

import io
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.express as px
import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError


TARGET_VALIDATION = 0.70
ROOT = Path(__file__).parent
LOCAL_DATA_DIR = ROOT / "public" / "data"
MONTH_NAMES = {
    "enero": "2026-01",
    "febrero": "2026-02",
    "marzo": "2026-03",
    "abril": "2026-04",
    "mayo": "2026-05",
    "junio": "2026-06",
    "julio": "2026-07",
    "agosto": "2026-08",
    "septiembre": "2026-09",
    "octubre": "2026-10",
    "noviembre": "2026-11",
    "diciembre": "2026-12",
}


st.set_page_config(page_title="BEES Vision", layout="wide")


def normalize_key(value: Any = "") -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def normalize_text(value: Any = "") -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def to_number(value: Any) -> float:
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return float(value) if pd.notna(value) else 0
    text = re.sub(r"[^\d,.-]", "", str(value)).replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0


def first_field(row: pd.Series | dict, names: list[str], fallback: str = "") -> Any:
    data = dict(row)
    normalized = {normalize_key(k): k for k in data.keys()}
    for name in names:
        key = normalized.get(normalize_key(name))
        if key and normalize_text(data.get(key)):
            return data.get(key)
    for name in names:
        target = normalize_key(name)
        for norm, original in normalized.items():
            if target in norm or norm in target:
                value = data.get(original)
                if normalize_text(value):
                    return value
    if fallback:
        return data.get(fallback, "")
    return ""


def date_key(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d")
    text = normalize_text(value)
    if re.fullmatch(r"\d{8}", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    try:
        number = float(text)
        if 30000 < number < 70000:
            return (pd.Timestamp("1899-12-30") + pd.to_timedelta(number, unit="D")).strftime("%Y-%m-%d")
    except ValueError:
        pass
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    return "" if pd.isna(parsed) else parsed.strftime("%Y-%m-%d")


def month_key(value: Any, sheet_name: str = "", source_file: str = "") -> str:
    d = date_key(value)
    if d:
        return d[:7]
    raw = normalize_key(f"{sheet_name} {source_file}")
    for name, month in MONTH_NAMES.items():
        if normalize_key(name) in raw:
            return month
    match = re.search(r"(?:^|[^0-9])(0?[1-9]|1[0-2])(?:[^0-9]|$)", f"{sheet_name} {source_file}")
    return f"2026-{int(match.group(1)):02d}" if match else ""


def classify_pillar(value: Any) -> str:
    key = normalize_key(value)
    if "frio" in key or "cold" in key:
        return "Frio"
    if "precio" in key or "price" in key:
        return "Precio"
    if "dispon" in key:
        return "Disponibilidad"
    return normalize_text(value) or "Sin pilar"


def classify_anomaly_type(value: Any) -> str:
    key = normalize_key(value)
    if "algoritmo" in key:
        return "ERROR DE ALGORITMO"
    if "fraude" in key:
        return "FRAUDE"
    if "foco" in key or "blur" in key:
        return "FUERA DE FOCO"
    if "pop" in key:
        return "POP INVALIDO"
    return normalize_text(value).upper() or "OTRA"


def image_tokens(value: Any) -> set[str]:
    text = normalize_text(value).lower().split("?")[0].rstrip("/")
    if not text:
        return set()
    without_protocol = re.sub(r"^https?://", "", text)
    last = re.split(r"[\\/]", without_protocol)[-1]
    photo = re.search(r"photo_[a-z0-9-]+", without_protocol)
    return {item for item in [without_protocol, last, photo.group(0) if photo else ""] if item}


def get_secret(name: str, default: Any = "") -> Any:
    try:
        return st.secrets.get(name, default)
    except (FileNotFoundError, StreamlitSecretNotFoundError):
        return default


def auth_credentials():
    try:
        service_account_json = st.secrets.get("GOOGLE_SERVICE_ACCOUNT_JSON")
        service_account = json.loads(service_account_json) if service_account_json else st.secrets.get("gcp_service_account")
    except (FileNotFoundError, StreamlitSecretNotFoundError):
        service_account = None
    except json.JSONDecodeError as error:
        st.error("El secret `GOOGLE_SERVICE_ACCOUNT_JSON` no es un JSON valido.")
        st.caption(str(error))
        st.stop()
    if not service_account:
        return None
    from google.oauth2.service_account import Credentials

    scopes = [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/spreadsheets",
    ]
    service_account_info = dict(service_account)
    private_key = str(service_account_info.get("private_key", "")).strip()
    private_key = private_key.strip('"').strip("'")
    if "\\n" in private_key:
        private_key = private_key.replace("\\n", "\n")
    private_key = private_key.replace("BEGIN_PRIVATE_KEY", "BEGIN PRIVATE KEY")
    private_key = private_key.replace("END_PRIVATE_KEY", "END PRIVATE KEY")
    service_account_info["private_key"] = private_key
    try:
        return Credentials.from_service_account_info(service_account_info, scopes=scopes)
    except Exception as error:
        st.error(
            "No pude autenticar con Google. Revisar en Streamlit Secrets que "
            "`gcp_service_account.private_key` este completa y con saltos de linea correctos."
        )
        st.caption(str(error))
        st.stop()


@st.cache_data(ttl=600, show_spinner=False)
def download_drive_files(folder_id: str) -> dict[str, bytes]:
    credentials = auth_credentials()
    if credentials is None or not folder_id:
        return {}
    from googleapiclient.discovery import build

    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    query = f"'{folder_id}' in parents and trashed = false"
    files = drive.files().list(q=query, fields="files(id,name,mimeType,modifiedTime)", pageSize=1000).execute().get("files", [])
    data: dict[str, bytes] = {}
    for item in files:
        name = item["name"]
        if not re.search(r"\.(xlsx|xls|csv|json)$", name, re.I):
            continue
        request = drive.files().get_media(fileId=item["id"])
        data[name] = request.execute()
    return data


def local_files() -> dict[str, bytes]:
    if not LOCAL_DATA_DIR.exists():
        return {}
    return {
        path.name: path.read_bytes()
        for path in LOCAL_DATA_DIR.iterdir()
        if path.suffix.lower() in {".xlsx", ".xls", ".csv"}
    }


def local_compact_payload():
    file = LOCAL_DATA_DIR / "dashboard-data.json"
    if not file.exists():
        return None
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except Exception:
        return None
    return (
        data.get("main", []),
        data.get("clients", []),
        data.get("review", []),
        data.get("anomalies", []),
        ["dashboard-data.json"],
    )


def compact_payload_from_bytes(content: bytes):
    try:
        data = json.loads(content.decode("utf-8"))
    except Exception:
        return None
    return (
        data.get("main", []),
        data.get("clients", []),
        data.get("review", []),
        data.get("anomalies", []),
        ["dashboard-data.json"],
    )


def read_excel_rows(name: str, content: bytes, sheet_filter: Any = None) -> list[dict[str, Any]]:
    try:
        workbook = pd.ExcelFile(io.BytesIO(content))
    except Exception:
        return []
    rows: list[dict[str, Any]] = []
    for sheet in workbook.sheet_names:
        if sheet_filter and not sheet_filter(sheet):
            continue
        raw = pd.read_excel(workbook, sheet_name=sheet, header=None, dtype=object)
        header_idx = 0
        for idx, values in raw.iterrows():
            if sum(bool(normalize_text(v)) for v in values.tolist()) >= 3:
                header_idx = idx
                break
        headers = [normalize_text(v) for v in raw.iloc[header_idx].tolist()]
        data = raw.iloc[header_idx + 1 :].copy()
        letters = [f"__{chr(65 + i)}" if i < 26 else f"__COL{i+1}" for i in range(len(headers))]
        data.columns = [h or letters[i] for i, h in enumerate(headers)]
        for idx, row in data.iterrows():
            values = ["" if pd.isna(v) else v for v in row.tolist()]
            item = {letters[i]: values[i] for i in range(len(values))}
            for i, header in enumerate(data.columns):
                if not str(header).startswith("__"):
                    item[str(header)] = values[i]
            item["__sheet"] = sheet
            item["__row"] = int(idx) + 1
            item["__sourceFile"] = name
            rows.append(item)
    return rows


@st.cache_data(ttl=600, show_spinner="Leyendo datos...")
def load_rows(folder_id: str = ""):
    files = download_drive_files(folder_id) or local_files()
    if folder_id and "dashboard-data.json" in files:
        compact = compact_payload_from_bytes(files["dashboard-data.json"])
        if compact:
            return compact
    if not folder_id:
        compact = local_compact_payload()
        if compact:
            return compact
    task_files = sorted([n for n in files if re.match(r"^(TAREAS\b.*|data\b.*)\.xlsx$", n, re.I)])
    client_file = next((n for n in files if n == "20260511104225plantillaClientesAR.xlsx"), "")
    review_file = next((n for n in sorted(files, reverse=True) if re.match(r"^(DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final.*|Q3\.\s*2026\s+DEL VALLE - Ticket tareas.*)\.xlsx$", n, re.I)), "")
    anomaly_files = sorted([n for n in files if re.match(r"^(Anomaly|Anomalias|Anomalías).*\.xlsx$", n, re.I)])

    main_rows = []
    for name in task_files:
        main_rows.extend(read_excel_rows(name, files[name]))
    client_rows = read_excel_rows(client_file, files[client_file], lambda s: normalize_key(s) == "clientes") if client_file else []
    review_rows = read_excel_rows(
        review_file,
        files[review_file],
        lambda s: bool(re.match(r"^(?:(?:DEL\s+)?VALLE\s+(0[3-9]|1[0-2])|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$", s, re.I)),
    ) if review_file else []
    anomaly_rows = []
    for name in anomaly_files:
        anomaly_rows.extend(read_excel_rows(name, files[name], lambda s: normalize_key(s) == "base"))
    anomaly_rows = [r for r in anomaly_rows if "delvalle" in normalize_key(first_field(r, ["distribuidor"], ""))]
    return main_rows, client_rows, review_rows, anomaly_rows, sorted(files)


def process_data(main_rows, client_rows, review_rows, anomaly_rows):
    clients = {}
    for row in client_rows:
        code = normalize_text(first_field(row, ["codigo cliente", "cod cliente", "poc id", "cliente"], "__I"))
        if code:
            clients[code] = {
                "clientName": normalize_text(first_field(row, ["nombre fantasia", "fantasia", "razon social", "cliente", "nombre"])),
                "seller": normalize_text(first_field(row, ["vendedor", "seller", "representante"])),
                "supervisor": normalize_text(first_field(row, ["supervisor", "jefe"])),
            }

    anomaly_index = {}
    anomalies = []
    for row in anomaly_rows:
        image = first_field(row, ["photo_image_url", "link imagen", "imagen", "image url", "image", "foto", "url"])
        date_value = first_field(row, ["task_executed_datetime", "fecha", "fecha ejecucion", "date"])
        item = {
            "image": image,
            "type": classify_anomaly_type(first_field(row, ["tipo anomaly", "tipo anomalia", "anomaly type", "motivo", "reason", "anomaly_detected"])),
            "promoter": normalize_text(first_field(row, ["promotor", "bdr_id"])),
            "task": normalize_text(first_field(row, ["task_name", "tarea", "detalle tarea", "task"])),
            "pillar": classify_pillar(first_field(row, ["pilar", "pilar de la liga"])),
            "dateKey": date_key(date_value),
            "monthKey": month_key(date_value, row.get("__sheet", ""), row.get("__sourceFile", "")),
        }
        anomalies.append(item)
        for token in image_tokens(image):
            anomaly_index[token] = item

    tasks = []
    for row in main_rows:
        pillar = classify_pillar(first_field(row, ["Pilar de la Liga", "pilar", "pillar"], "__K"))
        if pillar not in {"Disponibilidad", "Precio", "Frio"}:
            continue
        client_code = normalize_text(first_field(row, ["codigo cliente", "cod cliente", "poc id", "idcliente"], "__I"))
        image = first_field(row, ["Imagen", "photo_image_url", "link imagen", "image url", "image", "foto", "url"])
        anomaly = next((anomaly_index[t] for t in image_tokens(image) if t in anomaly_index), None)
        valid = 1 if to_number(row.get("Validada", row.get("__P", 0))) >= 1 else 0
        date_value = first_field(row, ["fecha", "fecha ejecucion", "fecha visita", "created at", "date"], "__A")
        task = normalize_text(first_field(row, ["nombre tarea", "tarea", "detalle tarea", "task"], "__N")) or "Sin tarea"
        tasks.append(
            {
                "clientCode": client_code,
                "clientName": clients.get(client_code, {}).get("clientName", ""),
                "supervisor": clients.get(client_code, {}).get("supervisor", ""),
                "promoter": normalize_text(first_field(row, ["promotor", "promoter"], "__G")) or "Sin promotor",
                "task": task,
                "pillar": pillar,
                "valid": valid,
                "invalid": 0 if valid else 1,
                "dateKey": date_key(date_value),
                "monthKey": month_key(date_value, row.get("__sheet", ""), row.get("__sourceFile", "")),
                "image": image,
                "anomaly": bool(anomaly),
                "anomalyType": anomaly["type"] if anomaly else "Sin anomaly",
            }
        )

    reviews = []
    for row in review_rows:
        comment = normalize_text(first_field(row, ["Comentario", "comment"]))
        comment_key = normalize_key(comment)
        date_value = first_field(row, ["FECHA EJECUCION", "fecha", "fecha ejecucion"])
        result = "Pendiente revision"
        if comment_key:
            if "falla" in comment_key and "algoritmo" in comment_key:
                result = "Valida por falla algoritmo"
            elif "invalida" in comment_key:
                result = "Invalida confirmada"
            else:
                result = comment
        reviews.append(
            {
                "promoter": normalize_text(first_field(row, ["PROMOTOR", "promotor"])) or "Sin promotor",
                "task": normalize_text(first_field(row, ["DETALLE TAREA", "detalle tarea", "tarea"])) or "Sin tarea",
                "dateKey": date_key(date_value),
                "monthKey": month_key(date_value, row.get("__sheet", ""), row.get("__sourceFile", "")),
                "comment": comment,
                "reviewed": "Si" if comment_key else "No",
                "result": result,
            }
        )

    return pd.DataFrame(tasks), pd.DataFrame(reviews), pd.DataFrame(anomalies)


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def append_sheet_row(sheet_name: str, row: list[Any]) -> bool:
    spreadsheet_id = get_secret("OPERATIONS_SPREADSHEET_ID", "")
    credentials = auth_credentials()
    if not spreadsheet_id or credentials is None:
        return False
    import gspread

    client = gspread.authorize(credentials)
    ws = client.open_by_key(spreadsheet_id).worksheet(sheet_name)
    ws.append_row(row, value_input_option="USER_ENTERED")
    return True


st.title("BEES Vision")
st.caption("Dashboard operativo con lectura desde Drive y guardado de relevamientos/PDA en Google Sheets.")

folder_id = get_secret("DRIVE_FOLDER_ID", "")
with st.sidebar:
    st.header("Filtros")
    if st.button("Actualizar datos"):
        st.cache_data.clear()
        st.rerun()

main_rows, client_rows, review_rows, anomaly_rows, loaded_files = load_rows(folder_id)
tasks, reviews, anomalies = process_data(main_rows, client_rows, review_rows, anomaly_rows)

if tasks.empty:
    st.warning("No se encontraron tareas. Revisar que la carpeta de Drive tenga los archivos TAREAS/data y que Streamlit tenga acceso.")
    st.stop()

months = sorted(tasks["monthKey"].dropna().unique())
with st.sidebar:
    month = st.selectbox("Mes", ["Todos"] + months, index=len(months) if months else 0)
    pillar = st.selectbox("Pilar", ["Todos"] + sorted(tasks["pillar"].dropna().unique()))
    promoter = st.selectbox("Promotor", ["Todos"] + sorted(tasks["promoter"].dropna().unique()))

filtered = tasks.copy()
if month != "Todos":
    filtered = filtered[filtered["monthKey"] == month]
if pillar != "Todos":
    filtered = filtered[filtered["pillar"] == pillar]
if promoter != "Todos":
    filtered = filtered[filtered["promoter"] == promoter]

valid = int(filtered["valid"].sum())
total = len(filtered)
invalid = total - valid
validation = valid / total if total else 0
anomaly_total = int(filtered["anomaly"].sum()) if "anomaly" in filtered else 0

c1, c2, c3, c4 = st.columns(4)
c1.metric("Tareas", f"{total:,}".replace(",", "."))
c2.metric("Validas", f"{valid:,}".replace(",", "."), pct(validation))
c3.metric("Invalidas", f"{invalid:,}".replace(",", "."))
c4.metric("Anomalies", f"{anomaly_total:,}".replace(",", "."))

monthly = tasks.groupby("monthKey", as_index=False).agg(validas=("valid", "sum"), invalidas=("invalid", "sum"), anomalies=("anomaly", "sum"))
monthly["total"] = monthly["validas"] + monthly["invalidas"]
monthly["validacion"] = monthly["validas"] / monthly["total"]
st.subheader("Acumulado anual")
fig = px.bar(monthly, x="monthKey", y=["validas", "invalidas", "anomalies"], barmode="group", color_discrete_map={"validas": "#0F9D76", "invalidas": "#E11D48", "anomalies": "#D97706"})
st.plotly_chart(fig, use_container_width=True)

st.subheader("Punto 3 - Oportunidades por pilar")
by_pillar = filtered.groupby("pillar", as_index=False).agg(validas=("valid", "sum"), invalidas=("invalid", "sum"), anomalies=("anomaly", "sum"))
by_pillar["total"] = by_pillar["validas"] + by_pillar["invalidas"]
by_pillar["validacion"] = by_pillar["validas"] / by_pillar["total"]
st.dataframe(by_pillar.sort_values("validacion"), use_container_width=True, hide_index=True)

lowest = by_pillar.sort_values("validacion").head(1)
if not lowest.empty and float(lowest.iloc[0]["validacion"]) < TARGET_VALIDATION:
    low = lowest.iloc[0]
    st.error(f"GENERAR PDA - {low['pillar']} esta en {pct(float(low['validacion']))}")
    with st.form("pda_form"):
        motivo = st.text_input("Motivo")
        plan = st.text_area("Plan de accion")
        responsable = st.text_input("Responsable")
        fecha = st.date_input("Fecha compromiso")
        if st.form_submit_button("Guardar PDA"):
            saved = append_sheet_row(
                "Planes de accion",
                [
                    f"pda-{datetime.now(timezone.utc).timestamp()}",
                    datetime.now().strftime("%Y-%m-%d %H:%M"),
                    month,
                    low["pillar"],
                    motivo,
                    plan,
                    responsable,
                    fecha.strftime("%Y-%m-%d"),
                    "ABIERTO",
                    "",
                ],
            )
            st.success("PDA guardado en Google Sheets." if saved else "PDA registrado en pantalla. Configurar Google Secrets para guardarlo en Sheets.")

st.subheader("Anomalies y relevamientos")
anom_month = anomalies if month == "Todos" else anomalies[anomalies["monthKey"] == month]
type_count = anom_month.groupby("type", as_index=False).size().sort_values("size", ascending=False) if not anom_month.empty else pd.DataFrame(columns=["type", "size"])
st.plotly_chart(px.bar(type_count, x="type", y="size", color="type"), use_container_width=True)

if not anom_month.empty:
    for idx, row in anom_month.head(20).iterrows():
        with st.expander(f"{row.get('promoter', 'Sin promotor')} - {row.get('task', 'Sin tarea')}"):
            if row.get("image"):
                st.link_button("Abrir foto", str(row["image"]))
            with st.form(f"anom_{idx}"):
                accion = st.selectbox("Accion", ["ERROR DE ALGORITMO", "POP INVALIDO", "FUERA DE FOCO", "FRAUDE", "OTRA"], key=f"a{idx}")
                comentario = st.text_area("Comentario", key=f"c{idx}")
                if st.form_submit_button("Guardar relevamiento"):
                    saved = append_sheet_row(
                        "Anomaly relevamientos",
                        [
                            f"anom-{datetime.now(timezone.utc).timestamp()}",
                            datetime.now().strftime("%Y-%m-%d %H:%M"),
                            row.get("monthKey", ""),
                            row.get("promoter", ""),
                            row.get("pillar", ""),
                            row.get("task", ""),
                            "",
                            row.get("image", ""),
                            accion,
                            comentario,
                            "",
                            "ABIERTO",
                        ],
                    )
                    st.success("Relevamiento guardado en Google Sheets." if saved else "Configurar Google Secrets para guardar en Sheets.")

with st.expander("Archivos cargados"):
    st.write(loaded_files)
