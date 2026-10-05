from vita.ui_match import Candidate, match_element, parse_description

CONTACTS_PAGE = [
    Candidate("e1", "link", "Contacts"),
    Candidate("e2", "textbox", "Name"),
    Candidate("e3", "combobox", "Type"),
    Candidate("e4", "textbox", "Email"),
    Candidate("e5", "textbox", "Phone"),
    Candidate("e6", "combobox", "Payment terms"),
    Candidate("e7", "checkbox", "1099 vendor"),
    Candidate("e8", "button", "Add contact"),
    Candidate("e9", "columnheader", "Name"),
    Candidate("e10", "columnheader", "Email"),
]

INVOICE_PAGE = [
    Candidate("i1", "combobox", "Customer"),
    Candidate("i2", "textbox", "Line 1 description"),
    Candidate("i3", "spinbutton", "Line 1 quantity"),
    Candidate("i4", "spinbutton", "Line 1 unit price"),
    Candidate("i5", "textbox", "Line 1 tax rate (percent)"),
    Candidate("i6", "button", "Save draft"),
    Candidate("i7", "button", "Preview"),
    Candidate("i8", "combobox", "Payment terms"),
]


def test_parse_description():
    assert parse_description("the Add contact button") == (
        "add contact",
        frozenset({"button", "link"}),
    )
    assert parse_description('"Email"')[0] == "email"
    assert parse_description("the Type dropdown") == ("type", frozenset({"combobox"}))


def test_fill_prefers_inputs_over_table_headers():
    assert match_element("the Name field", CONTACTS_PAGE, "set_input_value") == "e2"
    assert match_element("Email", CONTACTS_PAGE, "set_input_value") == "e4"
    assert match_element("the Type field", CONTACTS_PAGE, "set_input_value") == "e3"


def test_click_buttons():
    assert match_element("the Add contact button", CONTACTS_PAGE, "click") == "e8"
    assert match_element("Save draft", INVOICE_PAGE, "click") == "i6"


def test_line_item_labels():
    assert match_element("Line 1 unit price", INVOICE_PAGE, "set_input_value") == "i4"
    assert match_element("the line 1 tax rate field", INVOICE_PAGE, "set_input_value") == "i5"
    assert match_element("the Customer dropdown", INVOICE_PAGE, "set_input_value") == "i1"


def test_unsure_returns_none_for_classifier_fallback():
    assert match_element("the blue button at the bottom", INVOICE_PAGE, "click") is None
    assert match_element("Name", CONTACTS_PAGE) is None  # textbox vs column header, no hint
    assert match_element("the Name button", CONTACTS_PAGE, "click") is None


def test_offscreen_duplicates_resolve_to_visible():
    cands = [Candidate("a", "button", "Save", offscreen=True), Candidate("b", "button", "Save")]
    assert match_element("Save", cands, "click") == "b"


def test_forbidden_targets():
    from vita.ui_match import is_forbidden_target

    assert is_forbidden_target("the Delete draft button")
    assert is_forbidden_target("Emergency Kill-Switch (All L0)")
    assert is_forbidden_target("the Send invite button")
    assert not is_forbidden_target("the Send invoice button")
    assert not is_forbidden_target("Remove line 1")
