import re


def extract_patient_info(text: str) -> dict:
    """Parses medical report text to automatically extract patient demographic details

    (Name, Age, Gender, Blood Group, Contact Phone, Email).
    """
    if not text:
        return {}

    info = {
        "full_name": None,
        "age": None,
        "gender": None,
        "blood_group": None,
        "contact_phone": None,
        "contact_email": None,
    }

    lines = [line.strip() for line in text.split("\n") if line.strip()]
    header_chunk = "\n".join(lines[:15])  # Check top 15 lines of report for patient header

    # 1. Extract Full Name
    name_match = re.search(
        r"(?:Patient\s*Name|Name|Pt\s*Name|Patient)\s*[:\-]\s*([A-Za-z\s\.\,\'\-]+?)(?=\s*(?:\n|Age|Sex|Gender|DOB|Date|ID|Ref|Phone|Blood)|$)",
        header_chunk,
        re.IGNORECASE,
    )
    if name_match:
        raw_name = name_match.group(1).strip(" :-.,")
        # Ensure it's not a generic word like "Report" or "Summary"
        if len(raw_name) > 2 and raw_name.lower() not in ["report", "summary", "lab", "test", "male", "female"]:
            info["full_name"] = raw_name.title()

    # 2. Extract Age
    age_match = re.search(
        r"(?:Age|YRS|Years|Age/Sex)\s*[:\-]?\s*(\d{1,3})\s*(?:YRS|Years|Y/O|Y)?",
        header_chunk,
        re.IGNORECASE,
    )
    if age_match:
        try:
            parsed_age = int(age_match.group(1))
            if 0 <= parsed_age <= 120:
                info["age"] = parsed_age
        except ValueError:
            pass

    # 3. Extract Gender
    gender_match = re.search(
        r"(?:Gender|Sex)\s*[:\-]?\s*(Male|Female|Other|M|F)\b",
        header_chunk,
        re.IGNORECASE,
    )
    if gender_match:
        g = gender_match.group(1).upper()
        if g in ["M", "MALE"]:
            info["gender"] = "Male"
        elif g in ["F", "FEMALE"]:
            info["gender"] = "Female"
        else:
            info["gender"] = "Other"

    # 4. Extract Blood Group
    blood_match = re.search(
        r"(?:Blood\s*Group|Blood\s*Type|Blood)\s*[:\-]?\s*(A|B|AB|O)[\s]*([\+\-])",
        header_chunk,
        re.IGNORECASE,
    )
    if blood_match:
        info["blood_group"] = f"{blood_match.group(1).upper()}{blood_match.group(2)}"

    # 5. Extract Phone Number
    phone_match = re.search(
        r"(?:Phone|Mobile|Contact|Tel)\s*[:\-]?\s*([+\d\s\-\(\)]{7,15})",
        header_chunk,
        re.IGNORECASE,
    )
    if phone_match:
        phone_str = phone_match.group(1).strip()
        if len(re.sub(r"\D", "", phone_str)) >= 7:
            info["contact_phone"] = phone_str

    # 6. Extract Email
    email_match = re.search(
        r"[\w\.-]+@[\w\.-]+\.\w+",
        header_chunk,
    )
    if email_match:
        info["contact_email"] = email_match.group(0).strip()

    return info
