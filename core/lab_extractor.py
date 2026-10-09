"""Compatibility wrapper around the database-independent lab parser."""

from services.lab_parser import parse_lab_results


def extract_lab_results(text):
    """Return structured laboratory results using report or adult default ranges."""
    return parse_lab_results(text)
