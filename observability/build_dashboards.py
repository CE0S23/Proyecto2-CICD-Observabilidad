"""
Genera los 3 dashboards de OpenObserve (formato v5) como JSON en observability/dashboards/
y opcionalmente los crea/actualiza via API.

  python observability/build_dashboards.py            # solo genera los JSON
  O2_BASE=http://IP:5080 O2_USER=.. O2_PASSWORD=.. python observability/build_dashboards.py --apply
"""
import base64
import json
import os
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboards")
COLORS = ["#1f6f5c", "#2f5fa8", "#c2410c", "#8a5a00", "#7c3aed", "#b3261e", "#0e7490", "#4d7c0f"]


def axis(alias, label, agg=None, color=None):
    return {"label": label, "alias": alias, "column": alias, "color": color, "aggregationFunction": agg, "isDerived": False}


class Grid:
    """Acomoda paneles en una rejilla de 48 columnas."""

    def __init__(self):
        self.x, self.y, self.row_h, self.i = 0, 0, 0, 0

    def place(self, w, h):
        if self.x + w > 48:
            self.x, self.y, self.row_h = 0, self.y + self.row_h, 0
        self.i += 1
        layout = {"x": self.x, "y": self.y, "w": w, "h": h, "i": self.i}
        self.x += w
        self.row_h = max(self.row_h, h)
        return layout


def sql_panel(grid, title, ptype, stream, stype, sql, x, y, z=None, w=24, h=9, unit=None, desc="", decimals=2, extra_cfg=None):
    cfg = {"show_legends": True, "legends_position": None, "decimals": decimals, "unit": unit, "unit_custom": None,
           "axis_border_show": False, "connect_nulls": False, "no_value_replacement": "N/D", "wrap_table_cells": False}
    if extra_cfg:
        cfg.update(extra_cfg)
    return {
        "id": f"Panel_{grid.i + 1}",
        "type": ptype,
        "title": title,
        "description": desc,
        "config": cfg,
        "queryType": "sql",
        "queries": [{
            "query": sql,
            "customQuery": True,
            "fields": {"stream": stream, "stream_type": stype, "x": x, "y": y, "z": z or [], "breakdown": [],
                       "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []}},
            "config": {"promql_legend": "", "limit": 0, "min": 0, "max": 100, "time_shift": []},
        }],
        "layout": grid.place(w, h),
        "htmlContent": "",
        "markdownContent": "",
    }


def promql_panel(grid, title, stream, promql, legend, w=24, h=9, unit=None, desc="", ptype="line"):
    return {
        "id": f"Panel_{grid.i + 1}",
        "type": ptype,
        "title": title,
        "description": desc,
        "config": {"show_legends": True, "legends_position": None, "decimals": 2, "unit": unit, "unit_custom": None,
                   "axis_border_show": False, "connect_nulls": True, "no_value_replacement": "N/D"},
        "queryType": "promql",
        "queries": [{
            "query": promql,
            "customQuery": True,
            "fields": {"stream": stream, "stream_type": "metrics", "x": [], "y": [], "z": [], "breakdown": [],
                       "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []}},
            "config": {"promql_legend": legend, "limit": 0, "min": 0, "max": 100, "time_shift": []},
        }],
        "layout": grid.place(w, h),
        "htmlContent": "",
        "markdownContent": "",
    }


def md_panel(grid, title, md, w=48, h=4):
    return {"id": f"Panel_{grid.i + 1}", "type": "markdown", "title": title, "description": "",
            "config": {"show_legends": False, "legends_position": None, "decimals": 2},
            "queryType": "sql", "queries": [{"query": "", "customQuery": False,
             "fields": {"stream": "", "stream_type": "logs", "x": [], "y": [], "z": [], "breakdown": [],
                        "filter": {"filterType": "group", "logicalOperator": "AND", "conditions": []}},
             "config": {"promql_legend": "", "limit": 0, "min": 0, "max": 100, "time_shift": []}}],
            "layout": grid.place(w, h), "htmlContent": "", "markdownContent": md}


def dashboard(title, desc, panels, period="1h"):
    return {"version": 5, "title": title, "description": desc,
            "tabs": [{"tabId": "default", "name": "Default", "panels": panels}],
            "variables": {"list": [], "showDynamicFilters": True},
            "defaultDatetimeDuration": {"type": "relative", "relativeTimePeriod": period, "startTime": 0, "endTime": 0}}


TS = "histogram(_timestamp)"
REQ = "\"app_logs\" WHERE event = 'http_request'"


def app_dashboard():
    g = Grid()
    p = [
        sql_panel(g, "Peticiones totales", "metric", "app_logs", "logs",
                  f"SELECT count(*) AS y_axis_1 FROM {REQ}", [], [axis("y_axis_1", "Peticiones", "count")], w=12, h=6, decimals=0),
        sql_panel(g, "RPS promedio (ventana)", "metric", "app_logs", "logs",
                  f"SELECT count(*) / ((max(_timestamp) - min(_timestamp)) / 1000000.0 + 1) AS y_axis_1 FROM {REQ}",
                  [], [axis("y_axis_1", "req/s")], w=12, h=6),
        sql_panel(g, "Tasa de error 4xx/5xx (%)", "metric", "app_logs", "logs",
                  f"SELECT 100.0 * sum(CASE WHEN statuscode >= 400 THEN 1 ELSE 0 END) / count(*) AS y_axis_1 FROM {REQ}",
                  [], [axis("y_axis_1", "% error")], w=12, h=6, unit="percent"),
        sql_panel(g, "Latencia p95 global (ms)", "metric", "app_logs", "logs",
                  f"SELECT approx_percentile_cont(latency_ms, 0.95) AS y_axis_1 FROM {REQ}",
                  [], [axis("y_axis_1", "p95 ms")], w=12, h=6, unit="milliseconds"),
        sql_panel(g, "Latencia p50 / p95 por endpoint (ms)", "line", "app_logs", "logs",
                  f"SELECT {TS} AS x_axis_1, method || ' ' || route AS breakdown_1, approx_percentile_cont(latency_ms, 0.95) AS y_axis_1 "
                  f"FROM {REQ} GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "p95 ms", "p95", COLORS[2])], w=24, h=10, unit="milliseconds",
                  desc="p95 por endpoint (method + route). La tabla de la derecha muestra p50 y p95."),
        sql_panel(g, "Latencia por endpoint: p50, p95, promedio", "table", "app_logs", "logs",
                  f"SELECT method || ' ' || route AS x_axis_1, count(*) AS y_axis_1, approx_percentile_cont(latency_ms, 0.5) AS y_axis_2, "
                  f"approx_percentile_cont(latency_ms, 0.95) AS y_axis_3, avg(latency_ms) AS y_axis_4 FROM {REQ} GROUP BY x_axis_1 ORDER BY y_axis_1 DESC",
                  [axis("x_axis_1", "Endpoint")], [axis("y_axis_1", "Peticiones"), axis("y_axis_2", "p50 ms"), axis("y_axis_3", "p95 ms"), axis("y_axis_4", "Promedio ms")],
                  w=24, h=10),
        sql_panel(g, "Peticiones por segundo (RPS) por endpoint", "line", "app_logs", "logs",
                  f"SELECT histogram(_timestamp, '1 minute') AS x_axis_1, method || ' ' || route AS breakdown_1, count(*) / 60.0 AS y_axis_1 "
                  f"FROM {REQ} GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "req/s", None, COLORS[1])], w=24, h=10),
        sql_panel(g, "Tasa de errores 4xx / 5xx en el tiempo (%)", "line", "app_logs", "logs",
                  f"SELECT histogram(_timestamp, '1 minute') AS x_axis_1, "
                  f"100.0 * sum(CASE WHEN statuscode >= 400 AND statuscode < 500 THEN 1 ELSE 0 END) / count(*) AS y_axis_1, "
                  f"100.0 * sum(CASE WHEN statuscode >= 500 THEN 1 ELSE 0 END) / count(*) AS y_axis_2 "
                  f"FROM {REQ} GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "% 4xx", None, "#c2410c"), axis("y_axis_2", "% 5xx", None, "#b3261e")],
                  w=24, h=10, unit="percent"),
        sql_panel(g, "Status codes", "pie", "app_logs", "logs",
                  f"SELECT CAST(statuscode AS VARCHAR) AS x_axis_1, count(*) AS y_axis_1 FROM {REQ} GROUP BY x_axis_1 ORDER BY y_axis_1 DESC",
                  [axis("x_axis_1", "Status")], [axis("y_axis_1", "Peticiones", "count")], w=16, h=10),
        sql_panel(g, "Status codes por endpoint", "stacked", "app_logs", "logs",
                  f"SELECT method || ' ' || route AS x_axis_1, CAST(statuscode AS VARCHAR) AS breakdown_1, count(*) AS y_axis_1 FROM {REQ} GROUP BY x_axis_1, breakdown_1",
                  [axis("x_axis_1", "Endpoint")], [axis("y_axis_1", "Peticiones", "count")],
                  z=[axis("breakdown_1", "Status")], w=32, h=10),
        promql_panel(g, "Histograma OTel http.server.duration: p95 por endpoint (ms)", "http_server_duration_bucket",
                     "histogram_quantile(0.95, sum by (le, method, route) (rate(http_server_duration_bucket[5m])))", "{method} {route}",
                     w=24, h=10, unit="milliseconds"),
        promql_panel(g, "Métrica OTel http.server.requests: RPS por endpoint y status", "http_server_requests",
                     "sum by (method, route, status_code) (rate(http_server_requests[5m]))", "{method} {route} {status_code}", w=24, h=10),
        sql_panel(g, "Logs recientes (requests y excepciones)", "table", "app_logs", "logs",
                  "SELECT _timestamp AS x_axis_1, severity AS y_axis_1, method AS y_axis_2, route AS y_axis_3, statuscode AS y_axis_4, "
                  "latency_ms AS y_axis_5, trace_id AS y_axis_6, body AS y_axis_7 FROM \"app_logs\" ORDER BY _timestamp DESC LIMIT 50",
                  [axis("x_axis_1", "Timestamp")],
                  [axis("y_axis_1", "Nivel"), axis("y_axis_2", "Método"), axis("y_axis_3", "Ruta"), axis("y_axis_4", "Status"),
                   axis("y_axis_5", "Latencia ms"), axis("y_axis_6", "trace_id"), axis("y_axis_7", "Mensaje")], w=48, h=12),
        sql_panel(g, "Trazas recientes (spans raíz de NGINX)", "table", "default", "traces",
                  "SELECT _timestamp AS x_axis_1, operation_name AS y_axis_1, duration / 1000.0 AS y_axis_2, span_status AS y_axis_3, trace_id AS y_axis_4 "
                  "FROM \"default\" WHERE service_name = 'proyecto2-nginx' ORDER BY _timestamp DESC LIMIT 30",
                  [axis("x_axis_1", "Timestamp")],
                  [axis("y_axis_1", "Operación"), axis("y_axis_2", "Duración ms"), axis("y_axis_3", "Estado"), axis("y_axis_4", "trace_id")], w=48, h=10),
    ]
    return dashboard("Aplicación", "Latencia p50/p95 por endpoint, RPS, tasa de errores, status codes, logs y trazas (RF-04 / RF-06)", p)


def infra_dashboard():
    g = Grid()
    host = "host_name = 'ec2-proyecto2'"
    p = [
        sql_panel(g, "CPU actual (%)", "gauge", "system_cpu_utilization", "metrics",
                  "SELECT 100 * (1 - avg(value)) AS y_axis_1 FROM \"system_cpu_utilization\" WHERE state = 'idle' "
                  "AND _timestamp >= (SELECT max(_timestamp) - 60000000 FROM \"system_cpu_utilization\")",
                  [], [axis("y_axis_1", "CPU %")], w=12, h=8, unit="percent"),
        sql_panel(g, "RAM usada (%)", "gauge", "system_memory_utilization", "metrics",
                  "SELECT 100 * avg(value) AS y_axis_1 FROM \"system_memory_utilization\" WHERE state = 'used' "
                  "AND _timestamp >= (SELECT max(_timestamp) - 20000000 FROM \"system_memory_utilization\")",
                  [], [axis("y_axis_1", "RAM %")], w=12, h=8, unit="percent"),
        sql_panel(g, "Disco raíz usado (%)", "gauge", "system_filesystem_utilization", "metrics",
                  "SELECT 100 * max(value) AS y_axis_1 FROM \"system_filesystem_utilization\" WHERE mountpoint = '/' "
                  "AND _timestamp >= (SELECT max(_timestamp) - 60000000 FROM \"system_filesystem_utilization\")",
                  [], [axis("y_axis_1", "Disco %")], w=12, h=8, unit="percent"),
        sql_panel(g, "Temperatura (°C)", "metric", "host_temperature", "logs",
                  "SELECT CASE WHEN max(temperature_c) IS NULL THEN 'N/D' ELSE CAST(max(temperature_c) AS VARCHAR) END AS y_axis_1 "
                  "FROM \"host_temperature\" WHERE _timestamp = (SELECT max(_timestamp) FROM \"host_temperature\")",
                  [], [axis("y_axis_1", "°C")], w=12, h=8,
                  desc="EC2 no expone sensores térmicos al invitado; la sonda lee /sys/class/thermal y hwmon y reporta N/D sin inventar datos."),
        sql_panel(g, "CPU (%) en el tiempo", "area", "system_cpu_utilization", "metrics",
                  "SELECT histogram(_timestamp, '30 seconds') AS x_axis_1, 100 * (1 - avg(value)) AS y_axis_1 FROM \"system_cpu_utilization\" "
                  "WHERE state = 'idle' GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "CPU %", None, COLORS[0])], w=24, h=10, unit="percent"),
        sql_panel(g, "Memoria RAM (MiB)", "area-stacked", "system_memory_usage", "metrics",
                  "SELECT histogram(_timestamp, '30 seconds') AS x_axis_1, state AS breakdown_1, avg(value) / 1048576 AS y_axis_1 "
                  "FROM \"system_memory_usage\" GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "MiB")], z=[axis("breakdown_1", "Estado")], w=24, h=10),
        sql_panel(g, "Ancho de banda ens5 (KB/s, entrada y salida)", "line", "system_network_io", "metrics",
                  "SELECT x_axis_1, direction AS breakdown_1, (max(v) - min(v)) / 1024.0 / NULLIF((max(ts) - min(ts)) / 1000000.0, 0) AS y_axis_1 FROM ("
                  "SELECT histogram(_timestamp, '1 minute') AS x_axis_1, _timestamp AS ts, direction, value AS v FROM \"system_network_io\" WHERE device = 'ens5'"
                  ") GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "KB/s")], z=[axis("breakdown_1", "Dirección")], w=24, h=10,
                  desc="Derivada del contador acumulado system.network.io (bytes) de la interfaz principal ens5."),
        promql_panel(g, "Ancho de banda (PromQL rate, bytes/s)", "system_network_io",
                     "sum by (direction) (rate(system_network_io{device=\"ens5\"}[2m]))", "{direction}", w=24, h=10),
        sql_panel(g, "Disco: I/O (KB/s lectura/escritura)", "line", "system_disk_io", "metrics",
                  "SELECT x_axis_1, direction AS breakdown_1, (max(v) - min(v)) / 1024.0 / NULLIF((max(ts) - min(ts)) / 1000000.0, 0) AS y_axis_1 FROM ("
                  "SELECT histogram(_timestamp, '1 minute') AS x_axis_1, _timestamp AS ts, direction, value AS v FROM \"system_disk_io\" WHERE device = 'nvme0n1'"
                  ") GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "KB/s")], z=[axis("breakdown_1", "Dirección")], w=24, h=10),
        sql_panel(g, "Load average (1m / 5m / 15m)", "line", "system_cpu_load_average_1m", "metrics",
                  "SELECT histogram(_timestamp, '30 seconds') AS x_axis_1, avg(value) AS y_axis_1 FROM \"system_cpu_load_average_1m\" GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "load 1m", None, COLORS[3])], w=24, h=10),
        sql_panel(g, "Temperatura: estado de la sonda (evidencia)", "table", "host_temperature", "logs",
                  "SELECT _timestamp AS x_axis_1, status AS y_axis_1, available AS y_axis_2, sensors_found AS y_axis_3, thermal_dir AS y_axis_4, "
                  "hwmon_dir AS y_axis_5, invalid_sensors AS y_axis_6, reason AS y_axis_7 FROM \"host_temperature\" ORDER BY _timestamp DESC LIMIT 10",
                  [axis("x_axis_1", "Timestamp")],
                  [axis("y_axis_1", "Estado"), axis("y_axis_2", "Disponible"), axis("y_axis_3", "Sensores válidos"), axis("y_axis_4", "/sys/class/thermal"),
                   axis("y_axis_5", "/sys/class/hwmon"), axis("y_axis_6", "Lecturas inválidas"), axis("y_axis_7", "Motivo")], w=48, h=8),
    ]
    return dashboard("Infraestructura EC2", "CPU, RAM, ancho de banda, disco y temperatura de la instancia EC2 (RF-05)", p)


def cicd_dashboard():
    g = Grid()
    S = "\"cicd_pipeline\""
    p = [
        sql_panel(g, "Ejecuciones de pruebas", "metric", "cicd_pipeline", "logs",
                  f"SELECT count(*) AS y_axis_1 FROM {S} WHERE event = 'test_run'", [], [axis("y_axis_1", "Ejecuciones", "count")], w=12, h=6, decimals=0),
        sql_panel(g, "Pruebas exitosas (%)", "metric", "cicd_pipeline", "logs",
                  f"SELECT 100.0 * sum(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / count(*) AS y_axis_1 FROM {S} WHERE event = 'test_run'",
                  [], [axis("y_axis_1", "% éxito")], w=12, h=6, unit="percent"),
        sql_panel(g, "Despliegues exitosos", "metric", "cicd_pipeline", "logs",
                  f"SELECT count(*) AS y_axis_1 FROM {S} WHERE event = 'deploy' AND status = 'success'", [], [axis("y_axis_1", "Deploys", "count")],
                  w=12, h=6, decimals=0),
        sql_panel(g, "Último commit desplegado", "metric", "cicd_pipeline", "logs",
                  f"SELECT substr(commit_sha, 1, 7) AS y_axis_1 FROM {S} WHERE event = 'deploy' AND status = 'success' ORDER BY _timestamp DESC LIMIT 1",
                  [], [axis("y_axis_1", "commit")], w=12, h=6),
        sql_panel(g, "Éxito vs. fallo (pruebas)", "pie", "cicd_pipeline", "logs",
                  f"SELECT status AS x_axis_1, count(*) AS y_axis_1 FROM {S} WHERE event = 'test_run' GROUP BY x_axis_1",
                  [axis("x_axis_1", "Estado")], [axis("y_axis_1", "Ejecuciones", "count")], w=16, h=10),
        sql_panel(g, "Ejecuciones del pipeline en el tiempo", "stacked", "cicd_pipeline", "logs",
                  f"SELECT histogram(_timestamp, '10 minutes') AS x_axis_1, event || ':' || status AS breakdown_1, count(*) AS y_axis_1 FROM {S} "
                  f"GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "Eventos", "count")], z=[axis("breakdown_1", "Evento")], w=32, h=10),
        sql_panel(g, "Pruebas pasadas vs. fallidas por ejecución", "bar", "cicd_pipeline", "logs",
                  f"SELECT run_number || ' · ' || substr(commit_sha, 1, 7) AS x_axis_1, max(tests_passed) AS y_axis_1, max(tests_failed) AS y_axis_2 "
                  f"FROM {S} WHERE event = 'test_run' GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Run · commit")], [axis("y_axis_1", "Pasadas", None, "#1f6f5c"), axis("y_axis_2", "Fallidas", None, "#b3261e")], w=48, h=10),
        sql_panel(g, "Registro de ejecuciones del pipeline (logs)", "table", "cicd_pipeline", "logs",
                  f"SELECT _timestamp AS x_axis_1, event AS y_axis_1, status AS y_axis_2, substr(commit_sha, 1, 7) AS y_axis_3, branch AS y_axis_4, "
                  f"actor AS y_axis_5, tests_passed AS y_axis_6, tests_failed AS y_axis_7, ssh_executed AS y_axis_8, run_url AS y_axis_9 "
                  f"FROM {S} ORDER BY _timestamp DESC LIMIT 50",
                  [axis("x_axis_1", "Timestamp")],
                  [axis("y_axis_1", "Evento"), axis("y_axis_2", "Estado"), axis("y_axis_3", "Commit"), axis("y_axis_4", "Rama"), axis("y_axis_5", "Actor"),
                   axis("y_axis_6", "Pasadas"), axis("y_axis_7", "Fallidas"), axis("y_axis_8", "SSH"), axis("y_axis_9", "Run")], w=48, h=12),
    ]
    return dashboard("CI/CD", "Ejecuciones del pipeline, éxito vs. fallo, despliegues y último commit (RF-03 / RF-06)", p, period="1d")


def overview_dashboard():
    """Vista unificada del criterio de aceptación 3: pipeline + trazas + CPU/ancho de banda/temperatura/RAM a la vez."""
    g = Grid()
    p = [
        sql_panel(g, "Pipeline CI/CD (últimos eventos)", "table", "cicd_pipeline", "logs",
                  "SELECT _timestamp AS x_axis_1, event AS y_axis_1, status AS y_axis_2, substr(commit_sha, 1, 7) AS y_axis_3, actor AS y_axis_4 "
                  "FROM \"cicd_pipeline\" ORDER BY _timestamp DESC LIMIT 10",
                  [axis("x_axis_1", "Timestamp")], [axis("y_axis_1", "Evento"), axis("y_axis_2", "Estado"), axis("y_axis_3", "Commit"), axis("y_axis_4", "Actor")],
                  w=24, h=10),
        sql_panel(g, "Trazas HTTP individuales (NGINX → NestJS → PostgreSQL)", "table", "default", "traces",
                  "SELECT _timestamp AS x_axis_1, operation_name AS y_axis_1, duration / 1000.0 AS y_axis_2, trace_id AS y_axis_3 "
                  "FROM \"default\" WHERE service_name = 'proyecto2-nginx' ORDER BY _timestamp DESC LIMIT 10",
                  [axis("x_axis_1", "Timestamp")], [axis("y_axis_1", "Operación"), axis("y_axis_2", "Duración ms"), axis("y_axis_3", "trace_id")], w=24, h=10),
        sql_panel(g, "CPU (%)", "area", "system_cpu_utilization", "metrics",
                  "SELECT histogram(_timestamp, '30 seconds') AS x_axis_1, 100 * (1 - avg(value)) AS y_axis_1 FROM \"system_cpu_utilization\" "
                  "WHERE state = 'idle' GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "CPU %", None, COLORS[0])], w=12, h=9, unit="percent"),
        sql_panel(g, "Ancho de banda ens5 (KB/s)", "line", "system_network_io", "metrics",
                  "SELECT x_axis_1, direction AS breakdown_1, (max(v) - min(v)) / 1024.0 / NULLIF((max(ts) - min(ts)) / 1000000.0, 0) AS y_axis_1 FROM ("
                  "SELECT histogram(_timestamp, '1 minute') AS x_axis_1, _timestamp AS ts, direction, value AS v FROM \"system_network_io\" WHERE device = 'ens5'"
                  ") GROUP BY x_axis_1, breakdown_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "KB/s")], z=[axis("breakdown_1", "Dirección")], w=12, h=9),
        sql_panel(g, "Temperatura (°C)", "metric", "host_temperature", "logs",
                  "SELECT CASE WHEN max(temperature_c) IS NULL THEN 'N/D' ELSE CAST(max(temperature_c) AS VARCHAR) END AS y_axis_1 "
                  "FROM \"host_temperature\" WHERE _timestamp = (SELECT max(_timestamp) FROM \"host_temperature\")",
                  [], [axis("y_axis_1", "°C")], w=12, h=9, desc="N/D: EC2 no expone sensores térmicos (ver dashboard Infraestructura)."),
        sql_panel(g, "Memoria RAM usada (%)", "area", "system_memory_utilization", "metrics",
                  "SELECT histogram(_timestamp, '30 seconds') AS x_axis_1, 100 * avg(value) AS y_axis_1 FROM \"system_memory_utilization\" "
                  "WHERE state = 'used' GROUP BY x_axis_1 ORDER BY x_axis_1",
                  [axis("x_axis_1", "Tiempo", "histogram")], [axis("y_axis_1", "RAM %", None, COLORS[1])], w=12, h=9, unit="percent"),
    ]
    return dashboard("Vista general (criterio 3)", "Pipeline, trazas HTTP y CPU / ancho de banda / temperatura / RAM en la misma vista", p)


BUILDERS = {
    "01-aplicacion": app_dashboard,
    "02-infraestructura-ec2": infra_dashboard,
    "03-cicd": cicd_dashboard,
    "04-vista-general": overview_dashboard,
}


def api(method, path, body=None):
    base = os.environ["O2_BASE"].rstrip("/")
    auth = base64.b64encode(f"{os.environ['O2_USER']}:{os.environ['O2_PASSWORD']}".encode()).decode()
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    os.makedirs(OUT, exist_ok=True)
    apply = "--apply" in sys.argv
    existing = {}
    if apply:
        code, res = api("GET", "/api/default/dashboards")
        for d in (res or {}).get("dashboards", []):
            v = d.get("v5") or {}
            if v.get("title"):
                existing[v["title"]] = (v["dashboardId"], d.get("hash"), d.get("folder_id", "default"))
    for name, build in BUILDERS.items():
        dash = build()
        if apply:
            if dash["title"] in existing:
                did, h, _ = existing[dash["title"]]
                code, res = api("PUT", f"/api/default/dashboards/{did}?folder=default&hash={h}", {**dash, "dashboardId": did})
            else:
                code, res = api("POST", "/api/default/dashboards?folder=default", dash)
            print(name, code, (res if isinstance(res, str) else "ok")[:300])
            if code == 200 and isinstance(res, dict):
                dash = res.get("v5") or dash
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as fh:
            json.dump(dash, fh, ensure_ascii=False, indent=2)
    print("JSON en", OUT)


if __name__ == "__main__":
    main()
