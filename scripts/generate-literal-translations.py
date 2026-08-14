#!/usr/bin/env python3
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = ROOT / 'reports' / 'i18n-coverage-audit.json'
OUTPUT_PATH = ROOT / 'src' / 'lib' / 'localizedPhrases.js'
PROGRESS_PATH = ROOT / 'reports' / 'literal-translation-progress.json'
API_BASE = os.environ['OPENAI_API_BASE'].rstrip('/')
API_KEY = os.environ['OPENAI_API_KEY']
BATCH_SIZE = 45


def is_ui_phrase(value: str) -> bool:
    if not isinstance(value, str):
        return False
    value = value.strip()
    if len(value) < 2 or len(value) > 180 or not re.search(r'[A-Za-z]', value):
        return False
    if any(token in value for token in ('=>', '&&', '||', '===', '!==', 'import ', 'className', '${', '<=', '>=', '?.', " ? '", ' : ')):
        return False
    if value.startswith(('http://', 'https://', '/', './', '../')):
        return False
    return True


def schema():
    return {
        'type': 'json_schema',
        'json_schema': {
            'name': 'erp_literal_translation_batch',
            'strict': True,
            'schema': {
                'type': 'object',
                'properties': {
                    'translations': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'phrase': {'type': 'string'},
                                'fa': {'type': 'string'},
                                'ar': {'type': 'string'},
                            },
                            'required': ['phrase', 'fa', 'ar'],
                            'additionalProperties': False,
                        },
                    },
                },
                'required': ['translations'],
                'additionalProperties': False,
            },
        },
    }


def translate_batch(batch, number, total):
    instruction = '''You are a senior ERP localization specialist. Translate every English ERP user-interface phrase in the supplied JSON array into natural, professional Persian (fa) and Modern Standard Arabic (ar). Return every input phrase exactly once. Keep product names, file formats, acronyms, technical IDs, routes, currency codes, pure numbers, keyboard symbols, and variables unchanged. Preserve interpolation markers such as {{count}}, Markdown-like punctuation, and meaningful punctuation. Translate operational terms consistently across sales, purchasing, accounting, payroll, inventory, drivers, and analytics. Do not include explanations. The phrase field must be byte-for-byte identical to the supplied input string.'''
    response = requests.post(
        f'{API_BASE}/chat/completions',
        headers={'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'},
        json={
            'model': 'gpt-5-mini',
            'messages': [
                {'role': 'system', 'content': 'You output strict JSON only and never omit requested entries.'},
                {'role': 'user', 'content': instruction + '\n\nInput JSON:\n' + json.dumps(batch, ensure_ascii=False)},
            ],
            'response_format': schema(),
            'max_completion_tokens': 14000,
        },
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload['choices'][0]['message'].get('content') or ''
    translated = json.loads(content)['translations']
    indexed = {entry['phrase']: {'fa': entry['fa'], 'ar': entry['ar']} for entry in translated}
    missing = [phrase for phrase in batch if phrase not in indexed]
    unexpected = [phrase for phrase in indexed if phrase not in set(batch)]
    empty = [phrase for phrase, item in indexed.items() if not item['fa'].strip() or not item['ar'].strip()]
    if missing or unexpected or empty or len(indexed) != len(batch):
        raise RuntimeError(f'Batch {number}/{total} validation failed: missing={len(missing)}, unexpected={len(unexpected)}, empty={len(empty)}, expected={len(batch)}, received={len(indexed)}')
    return indexed


def main():
    audit = json.loads(AUDIT_PATH.read_text())
    phrases = sorted({phrase for entry in audit['candidates'] for phrase in entry['phrases'] if is_ui_phrase(phrase)})
    print(f'Preparing {len(phrases)} user-facing phrases for translation in batches of {BATCH_SIZE}.')
    completed = json.loads(PROGRESS_PATH.read_text()) if PROGRESS_PATH.exists() else {}
    total_batches = (len(phrases) + BATCH_SIZE - 1) // BATCH_SIZE

    for start in range(0, len(phrases), BATCH_SIZE):
        batch = phrases[start:start + BATCH_SIZE]
        batch_number = start // BATCH_SIZE + 1
        outstanding = [phrase for phrase in batch if phrase not in completed]
        if not outstanding:
            print(f'Batch {batch_number}/{total_batches}: cached')
            continue
        for attempt in range(1, 4):
            try:
                print(f'Batch {batch_number}/{total_batches}: translating {len(outstanding)} phrase(s), attempt {attempt}')
                completed.update(translate_batch(outstanding, batch_number, total_batches))
                PROGRESS_PATH.write_text(json.dumps(completed, ensure_ascii=False, indent=2))
                break
            except Exception as error:
                if attempt == 3:
                    raise
                print(f'Batch {batch_number}/{total_batches} retrying after error: {error}', file=sys.stderr)
                time.sleep(attempt * 2)

    missing = [phrase for phrase in phrases if phrase not in completed]
    if missing:
        raise RuntimeError(f'Final translation validation failed: {len(missing)} phrases are missing.')

    output = '''/**\n * Centrally managed translations for audited, previously hardcoded ERP interface phrases.\n * Source phrases are retained only as stable lookup keys; no database IDs or business values are modified.\n */\nexport const localizedPhrases = ''' + json.dumps({phrase: completed[phrase] for phrase in phrases}, ensure_ascii=False, indent=2) + ''';\n\nexport default localizedPhrases;\n'''
    OUTPUT_PATH.write_text(output)
    print(f'Wrote {len(phrases)} translated phrases to {OUTPUT_PATH}.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
