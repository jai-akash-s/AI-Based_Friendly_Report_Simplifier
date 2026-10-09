"""Build neutral clinician discussion prompts from abnormal laboratory results."""


def generate_doctor_questions(lab_results):
    """Return questions anchored to reported low/high values, without suggesting treatment."""
    abnormal_results = [
        result for result in lab_results or []
        if result.get("status") in {"Low", "High"}
    ]
    questions = []

    for result in abnormal_results:
        test_name = result.get("test_name") or "this test"
        value = result.get("value")
        unit = result.get("unit") or ""
        status = result["status"].lower()
        reading = f"{value} {unit}".strip() if value is not None else status
        questions.append(
            f"My {test_name} result is {reading} and is marked {status}. What may this mean in my situation?"
        )
        questions.append(
            f"Could anything affect my {test_name} result, and should it be reviewed with other findings?"
        )
        questions.append(
            f"Would you recommend repeating or monitoring my {test_name} result?"
        )

    if not questions:
        return [
            "Could you explain how these results fit with my health and any symptoms?",
            "Are any follow-up tests or routine monitoring appropriate for me?",
        ]

    return list(dict.fromkeys(questions))
