"""Print readability and labeled laboratory extraction evaluation metrics."""

import argparse
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

from services.evaluation import evaluate_lab_extraction, evaluate_readability, load_labeled_samples


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", type=Path, help="Path to original report text.")
    parser.add_argument("--simplified", type=Path, help="Path to simplified report text.")
    args = parser.parse_args()
    if bool(args.original) != bool(args.simplified):
        parser.error("--original and --simplified must be provided together.")

    result = {
        "lab_extraction": evaluate_lab_extraction(load_labeled_samples()),
    }
    if args.original and args.simplified:
        result["readability"] = {
            "original": evaluate_readability(args.original.read_text(encoding="utf-8")),
            "simplified": evaluate_readability(args.simplified.read_text(encoding="utf-8")),
        }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
