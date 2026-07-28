
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

_log_file = os.path.join(
    LOG_DIR,
    f"ingest_{datetime.now(timezone.utc).strftime('%Y-%m-%d_%H-%M')}.log",
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(_log_file, encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

def _print_banner(source: str, dry_run: bool, resume: bool, catalog_count: int) -> None:
    mode = "DRY RUN" if dry_run else "LIVE"
    resume_str = "resume=yes" if resume else "resume=no (fresh run)"
    logger.info("=" * 60)
    logger.info(f"  Brainwave Curriculum Ingest — {mode}")
    logger.info(f"  Source:  {source}")
    logger.info(f"  Docs:    {catalog_count} entries")
    logger.info(f"  Mode:    {resume_str}")
    logger.info(f"  Log:     {_log_file}")
    logger.info("=" * 60)

def _print_report(stats, elapsed: float) -> None:
    logger.info("")
    logger.info("=" * 60)
    logger.info("  INGEST COMPLETE")
    logger.info(f"  Total:     {stats.total}")
    logger.info(f"  Succeeded: {stats.succeeded}")
    logger.info(f"  Failed:    {stats.failed}")
    logger.info(f"  Skipped:   {stats.skipped} (already ingested)")
    logger.info(f"  Duration:  {elapsed:.0f}s ({elapsed/60:.1f} min)")
    logger.info("")
    logger.info(f"  Spot checks: {stats.spot_checks_run} run")
    logger.info(f"    Passed: {stats.spot_checks_passed}")
    logger.info(f"    Failed: {stats.spot_checks_failed}")
    logger.info("=" * 60)

    if stats.failed > 0:
        logger.info("\nFailed entries:")
        for r in stats.results:
            if not r.success:
                logger.info(f"  - {r.title} ({r.slug}): {r.error}")

    if stats.spot_checks_failed > 0:
        logger.warning(
            f"\nWARNING: {stats.spot_checks_failed} spot check(s) failed. "
            "Some documents may not be searchable. Check the log for details."
        )

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingest curriculum resources into the shared hs_curriculum pgvector collection."
    )
    parser.add_argument(
        "--source",
        choices=["openstax", "gcse", "alevel", "uk", "us", "bccampus", "oer", "all"],
        default="all",
        help="Which catalog to ingest (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be ingested without downloading or storing anything",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        default=True,
        help="Skip already-ingested slugs from state.json (default: on)",
    )
    parser.add_argument(
        "--no-resume",
        dest="resume",
        action="store_false",
        help="Re-ingest all entries, overwriting existing data",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List catalog entries for the selected source and exit",
    )
    parser.add_argument(
        "--slug",
        default=None,
        help="Ingest only the catalog entry with this exact slug (useful for a quick single-book test ingest)",
    )
    args = parser.parse_args()

    from ingest.catalog import SOURCE_FILTER
    catalog = SOURCE_FILTER.get(args.source, [])
    if args.slug:
        catalog = [e for e in catalog if e["slug"] == args.slug]

    if args.list:
        print(f"\n{args.source} catalog ({len(catalog)} entries):\n")
        for e in catalog:
            print(f"  [{e['curriculum'].upper()} {e['grade_level']}] {e['title']}")
            print(f"    subject={e['subject']}, source={e['source_type']}")
            print(f"    page_url={e['page_url']}")
        return 0

    _print_banner(args.source, args.dry_run, args.resume, len(catalog))

    if not catalog:
        logger.error(f"No catalog entries found for source={args.source} slug={args.slug}")
        return 1

    from ingest.pipeline import IngestPipeline
    pipeline = IngestPipeline(dry_run=args.dry_run, resume=args.resume)

    try:
        pipeline.setup()
    except Exception as e:
        logger.error(f"Pipeline setup failed: {e}")
        return 1

    start = time.time()
    stats = pipeline.run(catalog)
    elapsed = time.time() - start

    _print_report(stats, elapsed)

    return 0 if stats.failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
