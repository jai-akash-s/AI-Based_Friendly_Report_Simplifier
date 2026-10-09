"""Reading-level and labeled-sample evaluation for report simplification."""

import json
import re
from pathlib import Path

from services.lab_parser import parse_lab_results


_WORD_PATTERN = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)?|\d+(?:[.,]\d+)?")
_SENTENCE_PATTERN = re.compile(r"[.!?]+")
_SAMPLE_PATH = Path(__file__).resolve().parents[1] / "tests" / "data" / "lab_extraction_samples.json"


def _syllables(word):
    lowered = word.lower()
    if not re.search(r"[a-z]", lowered):
        return 1
    groups = re.findall(r"[aeiouy]+", lowered)
    count = max(1, len(groups))
    if lowered.endswith("e") and count > 1 and not lowered.endswith(("le", "ye")):
        count -= 1
    if lowered.endswith("le") and len(lowered) > 2 and lowered[-3] not in "aeiouy":
        count += 1
    return count


def evaluate_readability(text):
    """Return Flesch Reading Ease and Flesch-Kincaid Grade Level estimates."""
    words = _WORD_PATTERN.findall(text or "")
    if not words:
        return {
            "flesch_reading_ease": None,
            "flesch_kincaid_grade": None,
            "words": 0,
            "sentences": 0,
            "syllables": 0,
        }

    sentences = max(1, len(_SENTENCE_PATTERN.findall(text or "")))
    syllables = sum(_syllables(word) for word in words)
    words_per_sentence = len(words) / sentences
    syllables_per_word = syllables / len(words)
    return {
        "flesch_reading_ease": round(
            206.835 - (1.015 * words_per_sentence) - (84.6 * syllables_per_word),
            2,
        ),
        "flesch_kincaid_grade": round(
            (0.39 * words_per_sentence) + (11.8 * syllables_per_word) - 15.59,
            2,
        ),
        "words": len(words),
        "sentences": sentences,
        "syllables": syllables,
    }


def evaluate_lab_extraction(samples):
    """Compare test, value, unit, and status predictions against labeled reports."""
    total_expected = 0
    true_positives = 0
    false_positives = 0
    exact_samples = 0
    sample_count = len(samples)

    for sample in samples:
        expected = {
            _result_key(result)
            for result in sample.get("expected", [])
        }
        predicted = {
            _result_key(result)
            for result in parse_lab_results(sample.get("text", ""))
        }
        total_expected += len(expected)
        true_positives += len(expected & predicted)
        false_positives += len(predicted - expected)
        if expected == predicted:
            exact_samples += 1

    false_negatives = total_expected - true_positives
    predicted_count = true_positives + false_positives
    return {
        "sample_count": sample_count,
        "exact_match_accuracy": round(exact_samples / sample_count, 4) if sample_count else None,
        "value_precision": round(true_positives / predicted_count, 4) if predicted_count else None,
        "value_recall": round(true_positives / total_expected, 4) if total_expected else None,
        "correct_values": true_positives,
        "false_positive_values": false_positives,
        "missed_values": false_negatives,
    }


def _result_key(result):
    return (
        str(result.get("test_name") or "").casefold(),
        float(result.get("value")),
        str(result.get("unit") or "").casefold(),
        str(result.get("status") or "").casefold(),
    )


def load_labeled_samples():
    with _SAMPLE_PATH.open(encoding="utf-8") as sample_file:
        samples = json.load(sample_file)
    if not isinstance(samples, list):
        raise ValueError("The labeled laboratory evaluation set must be a JSON list.")
    return samples
