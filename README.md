# Dashboard BEES Vision - Auditoria Galaxia

Dashboard profesional en React, Tailwind CSS, Recharts y `xlsx` para analizar:

- Punto 3: oportunidades por pilar.
- Punto 4: revision de invalidas a validas.
- Control y analisis de anomalies.

## Ejecutar

```bash
npm install
npm run dev
```

Luego abrir la URL que muestre Vite.

## Archivos esperados

El dashboard intenta cargar automaticamente estos archivos desde `public/data`:

- `data - 2026-05-11T104007.975.xlsx`
- `20260511104225plantillaClientesAR.xlsx`
- `DEL VALLE 2026 DISTRIS - Ticket invalidas a validas final (1).xlsx`
- `Anomaly cierre Abril.xlsx`

Tambien permite cargar o reemplazar manualmente cada Excel desde la interfaz.

## Estructura

```text
src/
  App.jsx
  components/
    AnomalyAnalytics.jsx
    CriticalClients.jsx
    Filters.jsx
    KpiCard.jsx
    PillarCards.jsx
    PromoterRanking.jsx
    TicketReview.jsx
    TopTasks.jsx
    TrendChart.jsx
  utils/
    dataProcessing.js
```

Todos los calculos salen de los Excel cargados. No hay metricas hardcodeadas, salvo el objetivo de validacion del 70%.
