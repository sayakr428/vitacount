from vita.nudge import announces_unfinished_action, claims_action


def test_detects_announcements():
    assert announces_unfinished_action("Let me start with the name field.")
    assert announces_unfinished_action(
        "Now I'll fill in the customer details with dummy information."
    )
    assert announces_unfinished_action("First, let me select the customer we just created.")
    assert announces_unfinished_action("I'm going to open the contacts page.")


def test_ignores_questions_and_reports():
    assert not announces_unfinished_action("Shall I save it?")
    assert not announces_unfinished_action("Now I'll save the contact. Shall I save it?")
    assert not announces_unfinished_action("I filled in the name, email and phone.")
    assert not announces_unfinished_action("Done. The customer Jordan Sample is saved.")
    assert not announces_unfinished_action("")


def test_detects_claims_even_in_questions():
    assert claims_action(
        "I filled the Name field with Jordan Sample and the Email field. Shall I save it?"
    )
    assert claims_action("The contact has been saved. Shall I do anything else?")
    assert claims_action("I've entered the amount.")


def test_plain_answers_are_not_claims():
    assert not claims_action("Shall I save it?")
    assert not claims_action("The reports page shows profit and loss.")
