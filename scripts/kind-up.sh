#!/usr/bin/env bash
# one command local environment: kind cluster -> add-ons -> images -> helm release
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${TAG:-dev}"

kind get clusters | grep -qx stockpilot || kind create cluster --config k8s/kind-config.yaml
kubectl config use-context kind-stockpilot

./scripts/install-addons.sh kind

echo "==> building images and loading them into the kind nodes"
docker build -t "stockpilot-backend:$TAG" ./backend
docker build -t "stockpilot-frontend:$TAG" ./frontend
kind load docker-image "stockpilot-backend:$TAG" "stockpilot-frontend:$TAG" --name stockpilot

echo "==> deploying the chart"
helm upgrade --install stockpilot ./helm/stockpilot -n stockpilot \
  -f helm/stockpilot/values-dev.yaml \
  --set backend.tag="$TAG" --set frontend.tag="$TAG" \
  --wait --timeout 5m

kubectl get pods,svc,ingress,hpa -n stockpilot
echo
echo "app:     http://stockpilot.localhost"
echo "swagger: http://stockpilot.localhost/docs"
echo "grafana: http://grafana.localhost   (admin / stockpilot-admin)"
