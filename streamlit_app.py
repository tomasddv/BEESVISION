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
import streamlit.components.v1 as components
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
SUPERVISORS = {
    "BRUNO ISMAEL": [
        "NICASTRO LUCAS",
        "POCHETINO NICOLAS",
        "SIRI MARTIN",
        "GARCIA MATIAS",
        "VILLAGRA ENZO",
        "FUENTEALBA MAURICIO",
        "JARAMILLO JORDAN",
        "FABRE GASTON",
    ],
    "CASCO HERNAN": [
        "MENDEZ CARLOS",
        "FIELG FERNANDO",
        "ALVAREZ PABLO",
        "ROJAS ALEXANDER",
        "GIMENEZ JUAN MANUEL",
        "MORENI LUCIANO",
        "HERRERA MARIANO",
    ],
    "VITI ANIBAL": ["FEDERICO BISS"],
}


st.set_page_config(page_title="BEES Vision", layout="wide")


def normalize_key(value: Any = "") -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


PROMOTER_SUPERVISOR = {
    normalize_key(promoter): supervisor
    for supervisor, promoters in SUPERVISORS.items()
    for promoter in promoters
}


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


def supervisor_for(promoter: Any, fallback: Any = "") -> str:
    return PROMOTER_SUPERVISOR.get(normalize_key(promoter), normalize_text(fallback) or "Sin supervisor")


def task_weight(task: Any, valid_value: Any) -> int:
    text = normalize_key(task)
    if "x2" in text or to_number(valid_value) >= 2:
        return 2
    return 1


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
def download_drive_files(folder_id: str) -> dict[str, dict[str, Any]]:
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
        data[name] = {
            "content": request.execute(),
            "modifiedTime": item.get("modifiedTime", ""),
            "mimeType": item.get("mimeType", ""),
        }
    return data


def local_files() -> dict[str, dict[str, Any]]:
    if not LOCAL_DATA_DIR.exists():
        return {}
    return {
        path.name: {
            "content": path.read_bytes(),
            "modifiedTime": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
            "mimeType": "",
        }
        for path in LOCAL_DATA_DIR.iterdir()
        if path.suffix.lower() in {".xlsx", ".xls", ".csv"}
    }


def file_content(files: dict[str, Any], name: str) -> bytes:
    item = files[name]
    return item["content"] if isinstance(item, dict) and "content" in item else item


def file_mtime(files: dict[str, Any], name: str) -> str:
    item = files[name]
    return str(item.get("modifiedTime", "")) if isinstance(item, dict) else ""


def dashboard_json_is_fresh(files: dict[str, Any]) -> bool:
    if "dashboard-data.json" not in files:
        return False
    json_time = file_mtime(files, "dashboard-data.json")
    if not json_time:
        return True
    source_names = [
        name
        for name in files
        if name != "dashboard-data.json" and re.search(r"\.(xlsx|xls|csv)$", name, re.I)
    ]
    return not any(file_mtime(files, name) > json_time for name in source_names)


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
    if folder_id and dashboard_json_is_fresh(files):
        compact = compact_payload_from_bytes(file_content(files, "dashboard-data.json"))
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
        main_rows.extend(read_excel_rows(name, file_content(files, name)))
    client_rows = read_excel_rows(client_file, file_content(files, client_file), lambda s: normalize_key(s) == "clientes") if client_file else []
    review_rows = read_excel_rows(
        review_file,
        file_content(files, review_file),
        lambda s: bool(re.match(r"^(?:(?:DEL\s+)?VALLE\s+(0[3-9]|1[0-2])|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)$", s, re.I)),
    ) if review_file else []
    anomaly_rows = []
    for name in anomaly_files:
        anomaly_rows.extend(read_excel_rows(name, file_content(files, name), lambda s: normalize_key(s) == "base"))
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
        raw_valid = to_number(row.get("Validada", row.get("__P", 0)))
        weight = task_weight(first_field(row, ["nombre tarea", "tarea", "detalle tarea", "task"], "__N"), raw_valid)
        valid = int(max(0, raw_valid))
        date_value = first_field(row, ["fecha", "fecha ejecucion", "fecha visita", "created at", "date"], "__A")
        task = normalize_text(first_field(row, ["nombre tarea", "tarea", "detalle tarea", "task"], "__N")) or "Sin tarea"
        promoter = normalize_text(first_field(row, ["promotor", "promoter"], "__G")) or "Sin promotor"
        justification = normalize_text(first_field(row, ["justificacion", "justificación", "motivo justificacion", "motivo justificación"], "__Q"))
        tasks.append(
            {
                "clientCode": client_code,
                "clientName": clients.get(client_code, {}).get("clientName", ""),
                "supervisor": supervisor_for(promoter, clients.get(client_code, {}).get("supervisor", "")),
                "promoter": promoter,
                "task": task,
                "weight": weight,
                "pillar": pillar,
                "valid": valid,
                "invalid": 0 if valid else weight,
                "justification": justification,
                "justified": bool(justification) and "sinjustificacion" not in normalize_key(justification),
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
                "supervisor": supervisor_for(first_field(row, ["PROMOTOR", "promotor"])),
                "client": normalize_text(first_field(row, ["Cliente", "POC ID", "poc id"])),
                "pocId": normalize_text(first_field(row, ["POC ID", "poc id"])),
                "task": normalize_text(first_field(row, ["DETALLE TAREA", "detalle tarea", "tarea"])) or "Sin tarea",
                "dateKey": date_key(date_value),
                "monthKey": month_key(date_value, row.get("__sheet", ""), row.get("__sourceFile", "")),
                "image": first_field(row, ["IMAGEN", "Imagen", "FOTO", "Foto", "photo_image_url", "link imagen", "foto"]),
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


@st.cache_data(ttl=120, show_spinner=False)
def read_ops_sheet(sheet_name: str) -> pd.DataFrame:
    spreadsheet_id = get_secret("OPERATIONS_SPREADSHEET_ID", "")
    credentials = auth_credentials()
    if not spreadsheet_id or credentials is None:
        return pd.DataFrame()
    import gspread

    client = gspread.authorize(credentials)
    values = client.open_by_key(spreadsheet_id).worksheet(sheet_name).get_all_records()
    return pd.DataFrame(values)


def filtered_frame(df: pd.DataFrame, filters: dict[str, str]) -> pd.DataFrame:
    out = df.copy()
    for field, value in filters.items():
        if not value or value == "Todos" or field not in out:
            continue
        if field == "autoservicios":
            out = out[out["task"].map(lambda x: "programadeautoservicios" in normalize_key(x))]
        else:
            out = out[out[field] == value]
    return out


def calc_counts(df: pd.DataFrame) -> dict[str, Any]:
    if df.empty:
        return {"total": 0, "valid": 0, "invalid": 0, "validation": 0.0}
    valid = int(df["valid"].sum())
    invalid = int(df["invalid"].sum())
    total = valid + invalid
    return {"total": total, "valid": valid, "invalid": invalid, "validation": valid / total if total else 0.0}


def top_tasks(df: pd.DataFrame, metric: str, limit: int = 5) -> pd.DataFrame:
    if df.empty:
        return pd.DataFrame(columns=["task", "pillar", "count"])
    rows = (
        df.groupby(["task", "pillar"], as_index=False)
        .agg(count=(metric, "sum"), anomalies=("anomaly", "sum"))
        .sort_values("count", ascending=False)
        .head(limit)
    )
    return rows[rows["count"] > 0]


def comparable_day(df: pd.DataFrame) -> tuple[dict[str, Any], dict[str, Any], float]:
    if df.empty or "dateKey" not in df:
        return {}, {}, 0.0
    by_day = []
    for date, rows in df[df["dateKey"].astype(bool)].groupby("dateKey"):
        counts = calc_counts(rows)
        if counts["total"]:
            by_day.append({"date": date, **counts})
    by_day = sorted(by_day, key=lambda row: row["date"])
    if len(by_day) < 2:
        return (by_day[-1] if by_day else {}), {}, 0.0
    return by_day[-1], by_day[-2], by_day[-1]["validation"] - by_day[-2]["validation"]


def format_int(value: Any) -> str:
    return f"{int(value):,}".replace(",", ".")


def metric_card(label: str, value: Any, delta: str | None = None):
    st.metric(label, value, delta)


def exact_dashboard_html(raw_payload: dict[str, Any]) -> str:
    html_path = ROOT / "dashboard-local.html"
    html = html_path.read_text(encoding="utf-8")
    payload = json.dumps(raw_payload, ensure_ascii=False).replace("</", "<\\/")
    replacement = f"async function loadData(){{return {payload}}}"
    html = re.sub(r"async function loadData\(\)\{[\s\S]*?\}\s*function rawForMonth", replacement + " function rawForMonth", html, count=1)
    html = html.replace(
        "fetch(\"audit-notes\",{method:\"POST\",headers:{\"Content-Type\":\"application/json\"},body:JSON.stringify({notes:auditNotesObject()})}).catch(()=>{})",
        "Promise.resolve()",
    )
    html = html.replace(
        "const r=await fetch(\"audit-notes\",{cache:\"no-store\"});",
        "const r={ok:false,json:async()=>({})};",
    )
    return html


st.title("BEES Vision")
st.caption("Dashboard operativo con lectura desde Drive y guardado de relevamientos/PDA en Google Sheets.")

folder_id = get_secret("DRIVE_FOLDER_ID", "")
with st.sidebar:
    st.header("Filtros")
    if st.button("Actualizar datos"):
        st.cache_data.clear()
        st.rerun()

main_rows, client_rows, review_rows, anomaly_rows, loaded_files = load_rows(folder_id)
raw_payload = {
    "main": main_rows,
    "clients": client_rows,
    "review": review_rows,
    "anomalies": anomaly_rows,
    "planned": [],
}
tasks, reviews, anomalies = process_data(main_rows, client_rows, review_rows, anomaly_rows)

if tasks.empty:
    st.warning("No se encontraron tareas. Revisar que la carpeta de Drive tenga los archivos TAREAS/data y que Streamlit tenga acceso.")
    st.stop()

with st.sidebar:
    exact_view = st.toggle("Vista igual localhost", value=True)

if exact_view:
    components.html(exact_dashboard_html(raw_payload), height=5200, scrolling=True)
    with st.expander("Herramientas Streamlit"):
        st.write("Esta vista usa el mismo dashboard HTML del localhost con datos leidos desde Drive.")
        st.write(loaded_files)
    st.stop()

ops_anomaly = read_ops_sheet("Anomaly relevamientos")
ops_pda = read_ops_sheet("Planes de accion")

months = sorted(tasks["monthKey"].dropna().unique())
with st.sidebar:
    month = st.selectbox("Mes", ["Todos"] + months, index=len(months) if months else 0)
    pillar = st.selectbox("Pilar", ["Todos"] + sorted(tasks["pillar"].dropna().unique()))
    promoter = st.selectbox("Promotor", ["Todos"] + sorted(tasks["promoter"].dropna().unique()))
    supervisor = st.selectbox("Supervisor", ["Todos"] + sorted(tasks["supervisor"].dropna().unique()))
    task_filter = st.selectbox("Tarea", ["Todos"] + sorted(tasks["task"].dropna().unique()))
    autoservicios = st.checkbox("Solo programa de autoservicios")

filters = {
    "monthKey": month,
    "pillar": pillar,
    "promoter": promoter,
    "supervisor": supervisor,
    "task": task_filter,
}
filtered = filtered_frame(tasks, filters)
if autoservicios:
    filtered = filtered_frame(filtered, {"autoservicios": "Programa de autoservicios"})
filtered_reviews = filtered_frame(reviews, {"monthKey": month, "promoter": promoter, "supervisor": supervisor, "task": task_filter})
filtered_anomalies = anomalies.copy()
if month != "Todos":
    filtered_anomalies = filtered_anomalies[filtered_anomalies["monthKey"] == month]
if pillar != "Todos" and "pillar" in filtered_anomalies:
    filtered_anomalies = filtered_anomalies[filtered_anomalies["pillar"] == pillar]
if promoter != "Todos" and "promoter" in filtered_anomalies:
    filtered_anomalies = filtered_anomalies[filtered_anomalies["promoter"] == promoter]

counts = calc_counts(filtered)
cols = st.columns(6)
with cols[0]:
    metric_card("% Validacion", pct(counts["validation"]), f"{(counts['validation'] - TARGET_VALIDATION) * 100:.1f} pp")
with cols[1]:
    metric_card("Tareas", format_int(counts["total"]))
with cols[2]:
    metric_card("Validas", format_int(counts["valid"]))
with cols[3]:
    metric_card("Invalidas", format_int(counts["invalid"]))
with cols[4]:
    metric_card("Anomalies", format_int(len(filtered_anomalies)))
with cols[5]:
    metric_card("Tickets revisados", format_int((filtered_reviews["reviewed"] == "Si").sum() if not filtered_reviews.empty else 0))

st.subheader("Links importantes")
link_cols = st.columns(2)
with link_cols[0]:
    st.link_button("Excel ticket invalidas/validas", "https://docs.google.com/spreadsheets/d/1hnGKNUmNhcKt6LRyjB5BoDvTE7yCg9533-TEwtNrOy4/edit?pli=1&gid=1668551916#gid=1668551916")
with link_cols[1]:
    st.link_button("Power BI BEES Vision", "https://app.powerbi.com/groups/a7489b7a-e2d1-402a-a29e-f2d77f893b4e/reports/9deec9ee-08d4-4e33-9527-671a0d6cf643/4cc7e957ccf92587c0de?ctid=cef04b19-7776-4a94-b89b-375c77a8f936&experience=power-bi&clientSideAuth=0")

st.subheader("Acumulado anual")
monthly = tasks.groupby("monthKey", as_index=False).agg(validas=("valid", "sum"), invalidas=("invalid", "sum"), justificadas=("justified", "sum"), anomalies=("anomaly", "sum"))
monthly["total"] = monthly["validas"] + monthly["invalidas"]
monthly["validacion"] = monthly["validas"] / monthly["total"]
annual_cols = st.columns(2)
with annual_cols[0]:
    st.plotly_chart(
        px.bar(
            monthly,
            x="monthKey",
            y=["validas", "invalidas", "justificadas"],
            barmode="group",
            color_discrete_map={"validas": "#0F9D76", "invalidas": "#E11D48", "justificadas": "#D97706"},
        ),
        use_container_width=True,
    )
with annual_cols[1]:
    st.plotly_chart(px.line(monthly, x="monthKey", y="validacion", markers=True), use_container_width=True)

st.subheader("Justificaciones")
justified = filtered[filtered["justified"]] if "justified" in filtered else pd.DataFrame()
jcols = st.columns(2)
jcols[0].metric("% justificadas", pct(len(justified) / len(filtered) if len(filtered) else 0))
jcols[1].metric("Tareas justificadas", format_int(len(justified)))
if not justified.empty:
    top_just = justified.groupby("justification", as_index=False).size().sort_values("size", ascending=False).head(5)
    st.dataframe(top_just.rename(columns={"justification": "Justificacion", "size": "Veces"}), use_container_width=True, hide_index=True)

st.subheader("Validacion vs dia comparable")
current_day, previous_day, delta = comparable_day(filtered)
day_cols = st.columns(4)
day_cols[0].metric("Ultimo dia", pct(current_day.get("validation", 0)), current_day.get("date", "Sin fecha"))
day_cols[1].metric("Dia comparable", pct(previous_day.get("validation", 0)), previous_day.get("date", "Sin fecha"))
day_cols[2].metric("Variacion", f"{delta * 100:.1f} pp")
day_cols[3].metric("Invalidas ultimo dia", format_int(current_day.get("invalid", 0)))

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
            st.cache_data.clear()
            st.success("PDA guardado en Google Sheets." if saved else "PDA registrado en pantalla. Configurar Google Secrets para guardarlo en Sheets.")

task_cols = st.columns(2)
with task_cols[0]:
    st.subheader("Top 5 tareas invalidas")
    st.plotly_chart(px.bar(top_tasks(filtered, "invalid"), x="task", y="count", color="pillar"), use_container_width=True)
with task_cols[1]:
    st.subheader("Top 5 tareas validadas")
    st.plotly_chart(px.bar(top_tasks(filtered, "valid"), x="task", y="count", color="pillar"), use_container_width=True)

st.subheader("Clientes criticos")
if not filtered.empty:
    client_rows = filtered.groupby(["clientCode", "clientName"], as_index=False).agg(validas=("valid", "sum"), invalidas=("invalid", "sum"), anomalies=("anomaly", "sum"))
    client_rows["total"] = client_rows["validas"] + client_rows["invalidas"]
    client_rows["validacion"] = client_rows["validas"] / client_rows["total"]
    st.dataframe(client_rows.sort_values(["validacion", "total"], ascending=[True, False]).head(25), use_container_width=True, hide_index=True)

st.subheader("Punto 4 - Revision invalidas a validas")
review_cols = st.columns(5)
review_cols[0].metric("Total revision", format_int(len(filtered_reviews)))
review_cols[1].metric("Revisadas", format_int((filtered_reviews["reviewed"] == "Si").sum() if not filtered_reviews.empty else 0))
review_cols[2].metric("Pendientes", format_int((filtered_reviews["reviewed"] != "Si").sum() if not filtered_reviews.empty else 0))
review_cols[3].metric("Fallas algoritmo", format_int((filtered_reviews["result"] == "Valida por falla algoritmo").sum() if not filtered_reviews.empty else 0))
review_cols[4].metric("Invalidas confirmadas", format_int((filtered_reviews["result"] == "Invalida confirmada").sum() if not filtered_reviews.empty else 0))
if not filtered_reviews.empty:
    alg_top = filtered_reviews[filtered_reviews["result"] == "Valida por falla algoritmo"].groupby("task", as_index=False).size().sort_values("size", ascending=False).head(5)
    st.subheader("Top 5 tareas con fallas de algoritmo")
    st.dataframe(alg_top.rename(columns={"task": "Tarea", "size": "Veces"}), use_container_width=True, hide_index=True)
    st.dataframe(filtered_reviews.head(300), use_container_width=True, hide_index=True)

st.subheader("Control y analisis de anomalies")
ops_month = ops_anomaly.copy()
if not ops_month.empty and month != "Todos" and "mes" in ops_month:
    ops_month = ops_month[ops_month["mes"] == month]

if not ops_month.empty and "accion" in ops_month:
    action_count = ops_month.groupby("accion", as_index=False).size().sort_values("size", ascending=False)
else:
    action_count = filtered_anomalies.groupby("type", as_index=False).size().sort_values("size", ascending=False) if not filtered_anomalies.empty else pd.DataFrame(columns=["type", "size"])
    action_count = action_count.rename(columns={"type": "accion"})

an_cols = st.columns(2)
with an_cols[0]:
    st.plotly_chart(px.pie(action_count, values="size", names="accion", hole=0.55), use_container_width=True)
with an_cols[1]:
    if not action_count.empty:
        st.dataframe(action_count.rename(columns={"accion": "Accion", "size": "Veces"}), use_container_width=True, hide_index=True)

if not ops_month.empty and "accion" in ops_month:
    error_top = ops_month[ops_month["accion"].map(lambda x: normalize_key(x) == normalize_key("ERROR DE ALGORITMO"))]
    if not error_top.empty:
        st.subheader("Top 5 tareas con error de algoritmo")
        st.dataframe(error_top.groupby("tarea", as_index=False).size().sort_values("size", ascending=False).head(5).rename(columns={"tarea": "Tarea", "size": "Veces"}), use_container_width=True, hide_index=True)

st.subheader("Fotos de anomalies para relevar")
if not filtered_anomalies.empty:
    for idx, row in filtered_anomalies.head(30).iterrows():
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
                    st.cache_data.clear()
                    st.success("Relevamiento guardado en Google Sheets." if saved else "Configurar Google Secrets para guardar en Sheets.")

with st.expander("PDA guardados"):
    st.dataframe(ops_pda, use_container_width=True, hide_index=True)

with st.expander("Archivos cargados"):
    st.write(loaded_files)
