ARTIFACTS_DIR := .artifacts

.PHONY: artifacts clean-artifacts

## Build production files into .artifacts/ inside Docker (npm ci + npm run build
## run in the Dockerfile "build" stage), ready to copy to any HTTP server
artifacts: clean-artifacts
	docker build --target artifacts --output type=local,dest=$(ARTIFACTS_DIR) .
	@echo "Artifacts ready in $(ARTIFACTS_DIR)/"

## Remove everything in .artifacts/ except .gitkeep
clean-artifacts:
	mkdir -p $(ARTIFACTS_DIR)
	find $(ARTIFACTS_DIR) -mindepth 1 -maxdepth 1 ! -name .gitkeep -exec rm -rf {} +
