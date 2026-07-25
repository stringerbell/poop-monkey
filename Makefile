PORT ?= 8123

.PHONY: help test test-unit check serve

help:
	@echo "make test        run the unit tests"
	@echo "make check       syntax-check every game module"
	@echo "make serve       serve the game at http://localhost:$(PORT)"

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
