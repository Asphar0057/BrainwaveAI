
from __future__ import annotations

import argparse
import logging
import os
import sys
from dataclasses import dataclass, field

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)
sys.path.insert(0, os.path.join(_BACKEND_DIR, "services"))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)-8s %(message)s",
)
logger = logging.getLogger(__name__)

@dataclass
class TestCase:
    name: str
    query: str
    subject: str | None = None
    grade_level: str | None = None
    curriculum: str | None = None
    expect_subject_in: list[str] = field(default_factory=list)
    expect_book_contains: list[str] = field(default_factory=list)
    expect_page_number: bool = True
    min_results: int = 1
    top_k: int = 5

@dataclass
class TestResult:
    case: TestCase
    passed: bool
    results_count: int
    failures: list[str] = field(default_factory=list)
    first_result_page: str = ""
    first_result_book: str = ""
    first_result_subject: str = ""
    first_result_text_snippet: str = ""

STANDARD_TEST_CASES: list[TestCase] = [
    TestCase(
        name="Biology: photosynthesis",
        query="What is photosynthesis and how does it produce ATP?",
        subject="Biology",
        expect_subject_in=["Biology"],
        expect_book_contains=["Biology", "Microbiology", "Concepts"],
        expect_page_number=True,
    ),
    TestCase(
        name="Biology: cell membrane",
        query="Explain the structure and function of the phospholipid bilayer in cell membranes",
        subject="Biology",
        expect_subject_in=["Biology"],
        expect_page_number=True,
    ),
    TestCase(
        name="Biology: DNA replication",
        query="How does DNA replication work? Describe the role of DNA polymerase",
        subject="Biology",
        expect_subject_in=["Biology"],
        expect_page_number=True,
    ),
    TestCase(
        name="Biology: natural selection",
        query="What is natural selection and how does it drive evolution?",
        subject="Biology",
        expect_subject_in=["Biology"],
        expect_page_number=True,
    ),
    TestCase(
        name="Biology: mitosis vs meiosis",
        query="What is the difference between mitosis and meiosis?",
        subject="Biology",
        expect_subject_in=["Biology"],
        expect_page_number=True,
    ),

    TestCase(
        name="Chemistry: periodic table",
        query="How are elements arranged in the periodic table and what determines their properties?",
        subject="Chemistry",
        expect_subject_in=["Chemistry"],
        expect_page_number=True,
    ),
    TestCase(
        name="Chemistry: chemical bonding",
        query="What is the difference between ionic and covalent bonds?",
        subject="Chemistry",
        expect_subject_in=["Chemistry"],
        expect_page_number=True,
    ),
    TestCase(
        name="Chemistry: stoichiometry",
        query="How do you balance chemical equations and calculate molar mass?",
        subject="Chemistry",
        expect_subject_in=["Chemistry"],
        expect_page_number=True,
    ),
    TestCase(
        name="Chemistry: acid-base",
        query="What is pH and how do acids and bases react in neutralization?",
        subject="Chemistry",
        expect_subject_in=["Chemistry"],
        expect_page_number=True,
    ),

    TestCase(
        name="Physics: Newton's laws",
        query="Explain Newton's three laws of motion with examples",
        subject="Physics",
        expect_subject_in=["Physics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Physics: electric field",
        query="What is an electric field and how does Coulomb's law describe it?",
        subject="Physics",
        expect_subject_in=["Physics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Physics: waves",
        query="Describe the properties of waves including amplitude, frequency, and wavelength",
        subject="Physics",
        expect_subject_in=["Physics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Physics: thermodynamics",
        query="What is the first law of thermodynamics and how does it relate to heat and work?",
        subject="Physics",
        expect_subject_in=["Physics"],
        expect_page_number=True,
    ),

    TestCase(
        name="Calculus: derivatives",
        query="What is a derivative and how do you find the derivative of a polynomial function?",
        subject="Calculus",
        expect_subject_in=["Calculus", "Pre-Calculus"],
        expect_page_number=True,
    ),
    TestCase(
        name="Calculus: integrals",
        query="Explain the fundamental theorem of calculus and how integration works",
        subject="Calculus",
        expect_subject_in=["Calculus"],
        expect_page_number=True,
    ),
    TestCase(
        name="Calculus: limits",
        query="What is a limit and how do you evaluate limits at infinity?",
        subject="Calculus",
        expect_subject_in=["Calculus", "Pre-Calculus"],
        expect_page_number=True,
    ),

    TestCase(
        name="Algebra: quadratic equations",
        query="How do you solve quadratic equations using the quadratic formula?",
        subject="Algebra",
        expect_subject_in=["Algebra", "Pre-Calculus"],
        expect_page_number=True,
    ),
    TestCase(
        name="Algebra: linear systems",
        query="How do you solve a system of linear equations using substitution or elimination?",
        subject="Algebra",
        expect_subject_in=["Algebra"],
        expect_page_number=True,
    ),

    TestCase(
        name="Statistics: central tendency",
        query="What is the difference between mean, median, and mode in statistics?",
        subject="Statistics",
        expect_subject_in=["Statistics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Statistics: normal distribution",
        query="What is the normal distribution and what is the empirical rule (68-95-99.7)?",
        subject="Statistics",
        expect_subject_in=["Statistics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Statistics: hypothesis testing",
        query="Explain null hypothesis, p-value, and statistical significance",
        subject="Statistics",
        expect_subject_in=["Statistics"],
        expect_page_number=True,
    ),

    TestCase(
        name="Economics: supply and demand",
        query="How do supply and demand determine equilibrium price in a market?",
        subject="Economics",
        expect_subject_in=["Economics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Economics: GDP",
        query="What is GDP and how is it measured? What is the difference between real and nominal GDP?",
        subject="Economics",
        expect_subject_in=["Economics"],
        expect_page_number=True,
    ),
    TestCase(
        name="Economics: monetary policy",
        query="How does the Federal Reserve use monetary policy to control inflation?",
        subject="Economics",
        expect_subject_in=["Economics"],
        expect_page_number=True,
    ),

    TestCase(
        name="US History: Civil War",
        query="What were the main causes of the American Civil War?",
        subject="US History",
        expect_subject_in=["US History"],
        expect_page_number=True,
    ),
    TestCase(
        name="US History: Constitution",
        query="What are the main provisions of the US Constitution and the Bill of Rights?",
        expect_subject_in=["US History", "Government"],
        expect_page_number=True,
    ),

    TestCase(
        name="Psychology: classical conditioning",
        query="Explain classical conditioning using Pavlov's experiment",
        subject="Psychology",
        expect_subject_in=["Psychology"],
        expect_page_number=True,
    ),
    TestCase(
        name="Psychology: memory",
        query="What are the different types of memory? Describe working memory and long-term memory",
        subject="Psychology",
        expect_subject_in=["Psychology"],
        expect_page_number=True,
    ),

    TestCase(
        name="Anatomy: cardiovascular system",
        query="How does the human heart pump blood through the cardiovascular system?",
        subject="Anatomy",
        expect_subject_in=["Anatomy"],
        expect_page_number=True,
    ),
    TestCase(
        name="Anatomy: nervous system",
        query="What are neurons and how do nerve impulses travel through the nervous system?",
        subject="Anatomy",
        expect_subject_in=["Anatomy"],
        expect_page_number=True,
    ),

    TestCase(
        name="Cross-subject: osmosis",
        query="What is osmosis and how does it work in biological cells?",
        subject=None,
        expect_subject_in=["Biology", "Anatomy", "Chemistry"],
        expect_page_number=True,
    ),
    TestCase(
        name="Cross-subject: entropy",
        query="What is entropy and the second law of thermodynamics?",
        subject=None,
        expect_subject_in=["Physics", "Chemistry"],
        expect_page_number=True,
    ),
]

def run_test(case: TestCase, verbose: bool = False) -> TestResult:
    try:
        import context_store
    except ImportError as e:
        return TestResult(
            case=case, passed=False, results_count=0,
            failures=[f"Import error: {e}"],
        )

    if not context_store.available():
        return TestResult(
            case=case, passed=False, results_count=0,
            failures=["context_store not initialized — check DATABASE_URL and vector_store"],
        )

    try:
        results = context_store.search_context(
            query=case.query,
            user_id="0",
            use_hs=True,
            top_k=case.top_k,
            subject=case.subject,
            grade_level=case.grade_level,
            curriculum=case.curriculum,
        )
    except Exception as e:
        return TestResult(
            case=case, passed=False, results_count=0,
            failures=[f"search_context raised: {e}"],
        )

    failures: list[str] = []
    result = TestResult(case=case, passed=False, results_count=len(results))

    if len(results) < case.min_results:
        failures.append(f"Expected at least {case.min_results} results, got {len(results)}")

    if results:
        first = results[0]
        meta = first.get("metadata", {})
        result.first_result_text_snippet = (first.get("text") or "")[:120]
        result.first_result_page = meta.get("page_number") or meta.get("page_start") or ""
        result.first_result_book = meta.get("book_title") or meta.get("filename") or ""
        result.first_result_subject = meta.get("subject") or ""

        if case.expect_page_number:
            pages_found = [
                r.get("metadata", {}).get("page_number") or r.get("metadata", {}).get("page_start")
                for r in results
            ]
            if not any(p for p in pages_found):
                failures.append("No page numbers in any result — document may not have page tracking")

        if case.expect_subject_in:
            subjects_found = [r.get("metadata", {}).get("subject", "") for r in results]
            matched = any(
                s in subjects_found for s in case.expect_subject_in
            )
            if not matched:
                failures.append(
                    f"Expected subject in {case.expect_subject_in}, "
                    f"got: {list(set(subjects_found))}"
                )

        if case.expect_book_contains:
            books_found = [
                r.get("metadata", {}).get("book_title") or r.get("metadata", {}).get("filename") or ""
                for r in results
            ]
            matched = any(
                any(expected.lower() in book.lower() for book in books_found)
                for expected in case.expect_book_contains
            )
            if not matched:
                failures.append(
                    f"Expected book containing {case.expect_book_contains}, "
                    f"got: {[b[:40] for b in books_found if b][:3]}"
                )

    result.failures = failures
    result.passed = len(failures) == 0 and len(results) >= case.min_results
    return result

def _setup_context_store() -> bool:
    try:
        from sentence_transformers import SentenceTransformer
        import vector_store
        import context_store

        if context_store.available():
            return True

        try:
            model = SentenceTransformer("BAAI/bge-small-en-v1.5")
        except Exception:
            model = SentenceTransformer("all-MiniLM-L6-v2")
        vector_store.initialize(model)
        return context_store.available()
    except Exception as e:
        print(f"Setup failed: {e}")
        return False

def print_result(result: TestResult, verbose: bool = False) -> None:
    status = "PASS" if result.passed else "FAIL"
    print(f"  [{status}] {result.case.name} ({result.results_count} results)")

    if result.passed and verbose:
        pg = result.first_result_page or "?"
        book = (result.first_result_book or "?")[:50]
        subj = result.first_result_subject or "?"
        print(f"         Book: {book}  |  Page: {pg}  |  Subject: {subj}")
        print(f"         Snippet: {result.first_result_text_snippet[:80]}...")

    if not result.passed:
        pg = result.first_result_page or "no-page"
        book = (result.first_result_book or "no-book")[:50]
        subj = result.first_result_subject or "no-subject"
        print(f"         Book: {book}  |  Page: {pg}  |  Subject: {subj}")
        if result.first_result_text_snippet:
            print(f"         Snippet: {result.first_result_text_snippet[:80]}...")
        for f in result.failures:
            print(f"         FAIL: {f}")

def main() -> int:
    parser = argparse.ArgumentParser(description="RAG retrieval quality tests")
    parser.add_argument("--subject", help="Only run tests for this subject")
    parser.add_argument("--name", help="Only run tests matching this name substring")
    parser.add_argument("--top-k", type=int, default=5, help="Number of results to retrieve (default: 5)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show details for passing tests too")
    args = parser.parse_args()

    print("\nBrainwave RAG Test Suite")
    print("=" * 60)

    if not _setup_context_store():
        print("\nERROR: Could not initialize context_store.")
        print("  Make sure DATABASE_URL is set and the vector_store is initialized.")
        print("  Run the ingest pipeline first: python -m ingest.run --source all")
        return 1

    import context_store as cs
    try:
        stats = cs.get_hs_stats()
        total_chunks = stats.get("total_chunks", 0)
        total_docs = stats.get("total_docs", 0)
        print(f"\nHS Curriculum: {total_docs} docs, {total_chunks:,} chunks indexed")
        by_subject = stats.get("by_subject", {})
        if by_subject:
            print("Subjects: " + ", ".join(f"{s}({n})" for s, n in sorted(by_subject.items())))
    except Exception as e:
        print(f"  (Stats unavailable: {e})")

    print()

    cases = STANDARD_TEST_CASES
    if args.subject:
        cases = [c for c in cases if c.subject and args.subject.lower() in c.subject.lower()]
    if args.name:
        cases = [c for c in cases if args.name.lower() in c.name.lower()]

    if not cases:
        print("No test cases matched filters.")
        return 0

    for case in cases:
        case.top_k = args.top_k

    subjects_tested: set[str] = set()
    results: list[TestResult] = []

    current_subject = None
    for case in cases:
        group = case.subject or "(no filter)"
        if group != current_subject:
            current_subject = group
            print(f"\n── {group} ──")

        result = run_test(case, verbose=args.verbose)
        results.append(result)
        print_result(result, verbose=args.verbose)

        if case.subject:
            subjects_tested.add(case.subject)

    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    print("\n" + "=" * 60)
    print(f"Results: {passed}/{total} passed, {failed} failed")

    if failed > 0:
        print("\nFailed tests:")
        for r in results:
            if not r.passed:
                print(f"  - {r.case.name}")
                for f in r.failures:
                    print(f"      {f}")
        print()
        print("Tip: If many tests fail, the books may not be ingested yet.")
        print("  Run: python -m ingest.run --source openstax")

    print()
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
