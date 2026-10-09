"""Build chart-ready history for a single laboratory test."""


def build_lab_trend(reports, test_name):
    """Return matching report values in the order supplied by the caller."""
    requested_name = (test_name or "").strip()
    if not requested_name:
        raise ValueError("A laboratory test name is required.")

    points = []
    display_name = requested_name
    for report in reports:
        for result in report.get("lab_results") or []:
            result_name = str(result.get("test_name") or "")
            if result_name.casefold() != requested_name.casefold():
                continue
            try:
                value = float(result["value"])
            except (KeyError, TypeError, ValueError):
                continue
            display_name = result_name
            points.append({
                "report_id": report.get("id"),
                "date": report.get("created_at"),
                "value": value,
                "unit": result.get("unit") or "",
                "status": result.get("status") or "Unknown",
            })
            break

    return {"test_name": display_name, "points": points}
