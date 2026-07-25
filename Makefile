PORT ?= 8123

.PHONY: help test test-unit check serve deploy pages-status

help:
	@echo "make test         run the unit tests"
	@echo "make check        syntax-check every game module"
	@echo "make serve        serve the game at http://localhost:$(PORT)"
	@echo "make deploy       push main and publish to GitHub Pages"
	@echo "make pages-status show the live URL and the last deploy"

test: test-unit

test-unit:
	node --test 'test/*.test.mjs'

# ES modules can't be parsed by `node --check` as .js, so check them as .mjs copies.
check:
	@tmp=$$(mktemp -d); \
	for f in js/*.js; do cp "$$f" "$$tmp/$$(basename $${f%.js}).mjs"; done; \
	fail=0; \
	for f in $$tmp/*.mjs; do node --check "$$f" || fail=1; done; \
	rm -rf "$$tmp"; \
	if [ $$fail -eq 0 ]; then echo "all modules parse"; else exit 1; fi

serve:
	@echo "http://localhost:$(PORT)"
	@python3 -m http.server $(PORT)

# Publishing runs entirely through the GitHub Actions workflow in
# .github/workflows/deploy.yml, which fires on every push to main.
deploy: check test-unit
	@git diff --quiet || { echo "working tree is dirty — commit first"; exit 1; }
	git push origin main
	@echo "waiting for the Pages deploy..."
	@gh run watch $$(gh run list --workflow=deploy.yml --branch=main --limit=1 --json databaseId -q '.[0].databaseId') --exit-status
	@$(MAKE) --no-print-directory pages-status

pages-status:
	@gh api repos/{owner}/{repo}/pages -q '"live: \(.html_url)   source: \(.build_type)   status: \(.status)"' 2>/dev/null \
		|| echo "Pages is not enabled yet — run 'make deploy'"
