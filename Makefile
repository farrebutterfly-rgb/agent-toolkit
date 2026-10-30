.PHONY: install demo test typecheck live check
install:   ## pinned dependencies from package-lock.json
	npm ci
demo:      ## fixture demo, no API key, no cost
	npm run demo
test:      ## unit and agent tests against the local record service
	npm test
typecheck:
	npm run typecheck
live:      ## real model run, needs ANTHROPIC_API_KEY, costs money
	npm run live
check: typecheck test demo
