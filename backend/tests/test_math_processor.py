from services.math_processor import process_math_in_response


def test_preserves_multiline_inline_latex_as_one_expression():
    source = "The integral of \\(2x^2\n+ 3\\) is \\(\\frac{2}{3}x^3\n+ 3x\n+ C\\)."

    assert process_math_in_response(source) == source
