"""Catch replies that announce or claim on-screen actions that never happened.

nemotron-3-super sometimes (a) answers a tool result with "Let me fill in
the name field." and ends its turn without the tool call, or (b) says "I
filled the Name field with Jordan Sample" when it made no tool call at all.
Either way nothing changed on screen. When a reply looks like that, the bot
nudges the model to actually do it.
"""

import re

_ANNOUNCE = re.compile(
    r"\b(let me|let's|i'?ll|i will|i'?m going to|now i'?ll|next i'?ll|going to|first,? i'?ll)\b"
    r"[^.?!]*\b(fill|type|enter|select|choose|click|press|set|add|put|open|navigate|go to|"
    r"start|save|submit|pick|update|change)\b",
    re.IGNORECASE,
)

_CLAIM = re.compile(
    r"\b(i(?: have|'ve)? (?:filled|entered|typed|selected|chose|clicked|saved|added|set|"
    r"created|sent|recorded|opened|updated)|(?:has|have) been (?:saved|created|added|sent|"
    r"recorded|filled|updated))\b",
    re.IGNORECASE,
)

ANNOUNCE_NUDGE = (
    "You said you would do that but made no tool call, so nothing happened on the screen. "
    "Do it now with the screen or navigate tools, then say what you did in one sentence. "
    "If you are waiting for the user's yes before saving, ask that question instead."
)

CLAIM_NUDGE = (
    "You described actions, but you made no tool call since the user's last message, so none "
    "of it happened on the screen. Do it now with the screen tools, and report only what the "
    "tool results confirm (done true, and the value or url they show)."
)

MAX_NUDGES_PER_USER_TURN = 4


def announces_unfinished_action(text: str) -> bool:
    text = (text or "").strip()
    if not text or text.endswith("?"):
        return False
    return bool(_ANNOUNCE.search(text))


def claims_action(text: str) -> bool:
    return bool(_CLAIM.search(text or ""))
