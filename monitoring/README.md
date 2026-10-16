# Monitoring: Prometheus + Grafana

```text
FastAPI /metrics  ◄── scraped every 15s ──  Prometheus  ◄── queries ──  Grafana
      ▲                                        ▲
      │ ServiceMonitor (helm chart)            │ PrometheusRule (helm chart): 3 alerts
      │ tells the operator "scrape port http   │
      │ on Services labelled component=backend"│
```

| Piece | Where |
|-------|-------|
| Prometheus Operator, Prometheus, Grafana, kube-state-metrics, node-exporter | `kube-prometheus-stack` Helm chart, values in [`kube-prometheus-stack-values.yaml`](kube-prometheus-stack-values.yaml) |
| What to scrape | [`helm/stockpilot/templates/servicemonitor.yaml`](../helm/stockpilot/templates/servicemonitor.yaml) |
| Alerts (backend down, >5% 5xx, p95 > 1s) | [`helm/stockpilot/templates/prometheusrule.yaml`](../helm/stockpilot/templates/prometheusrule.yaml) |
| Dashboard (auto-loaded by the Grafana sidecar) | [`helm/stockpilot/dashboards/stockpilot.json`](../helm/stockpilot/dashboards/stockpilot.json) |

## Install

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace -f monitoring/kube-prometheus-stack-values.yaml
```

(`./scripts/install-addons.sh` does this for you.)

## Open it

```bash
# Grafana: through the ingress on kind
open http://grafana.localhost                    # admin / stockpilot-admin
# or port-forward
kubectl port-forward -n monitoring svc/monitoring-grafana 3001:80

# Prometheus UI (Status → Targets shows stockpilot-backend as UP)
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090
open http://localhost:9090/targets
```

## What the app exposes

`prometheus-fastapi-instrumentator` adds request metrics to every route, and `/api/products/{id}/movements` increments a custom business counter:

| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | counter | `handler`, `method`, `status` (2xx/4xx/5xx) |
| `http_request_duration_seconds` | histogram | `handler`, `method` (only 0.1/0.5/1s buckets) |
| `http_request_duration_highr_seconds` | histogram | none, but ~20 fine buckets → used for p50/p95/p99 |
| `stockpilot_stock_movements_total` | counter | `reason` (RESTOCK / SALE / ADJUSTMENT) |

## Dashboard panels

"StockPilot - Application Overview" has these panels:

- **Stat tiles:** requests/sec, p95 latency, 5xx error rate, ready backend pods.
- **Request rate by endpoint.**
- **Latency:** p50 / p95 / p99.
- **Responses by status class.**
- **Stock movements by reason.** This is the business metric.
- **Backend CPU per pod vs CPU request.** This is what the HPA reacts to.
- **HPA replicas:** current, desired and max.

Useful PromQL to try in Prometheus:

```promql
sum by (handler) (rate(http_requests_total{namespace="stockpilot"}[1m]))
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_highr_seconds_bucket{namespace="stockpilot"}[5m])))
sum by (reason) (increase(stockpilot_stock_movements_total[1h]))
```
