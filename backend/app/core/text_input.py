import re


def has_multiple_questions(text: str) -> bool:
    numbers = re.findall(r"(?:^|\n)\s*(?:câu|question|q)\s*[#.:]?\s*(\d{1,3})\b", text, re.IGNORECASE)
    # Reading question numbers are 101-200; ordinary numbered paragraph lists remain valid context.
    numbers += [number for number in re.findall(r"(?:^|\n)\s*(\d{1,3})[.)]\s+", text) if 101 <= int(number) <= 200]
    labels = re.findall(r"(?:^|\s)(?:\(([A-D])\)|([A-D])[.):])\s*(?=\S)", text, re.IGNORECASE)
    letters = [(first or second).upper() for first, second in labels]
    keys = re.findall(r"(?:đáp án(?:\s+(?:chuẩn|đúng))?|correct answer|answer key|answer)\s*[:=-]", text, re.IGNORECASE)
    return len(set(numbers)) > 1 or len(keys) > 1 or (letters.count('A') > 1 and letters.count('B') > 1)
