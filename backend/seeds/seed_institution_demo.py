"""Create an isolated local Cerbyl institution demo.

Run from the backend directory:
    python3 seeds/seed_institution_demo.py
"""

import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from argon2 import PasswordHasher


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal  # noqa: E402
import models  # noqa: E402


STUDENT_USERNAME = "cerbyl.student.test"
STUDENT_PASSWORD = "CerbylStudent#2026"
EDUCATOR_USERNAME = "cerbyl.teacher.test"
EDUCATOR_PASSWORD = "CerbylTeacher#2026"
ORGANIZATION_SLUG = "cerbyl-demo-institute"

ph = PasswordHasher()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def assert_safe_environment() -> None:
    environment = (
        os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "development"
    ).strip().lower()
    database_url = (os.getenv("DATABASE_URL") or "").lower()
    if environment in {"production", "prod"}:
        raise RuntimeError("Demo seed is disabled in production.")
    if database_url.startswith(("postgresql://", "postgres://")) and "localhost" not in database_url:
        raise RuntimeError(
            "Demo seed refused a non-local PostgreSQL database. "
            "Use a local development database."
        )


def upsert_user(
    db,
    *,
    username: str,
    password: str,
    first_name: str,
    last_name: str,
    email: str,
    role: str,
):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        user = models.User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            hashed_password=ph.hash(password),
            account_role=role,
            school_university="Cerbyl Demo Institute",
            field_of_study="Computer Science" if role == "student" else "Faculty",
        )
        db.add(user)
        db.flush()
    else:
        user.first_name = first_name
        user.last_name = last_name
        user.email = email
        user.account_role = role
        user.hashed_password = ph.hash(password)
    return user


def get_or_create(db, model, defaults=None, **filters):
    instance = db.query(model).filter_by(**filters).first()
    if instance:
        return instance
    instance = model(**filters, **(defaults or {}))
    db.add(instance)
    db.flush()
    return instance


def seed() -> tuple[models.User, models.User, models.Organization]:
    assert_safe_environment()
    db = SessionLocal()
    try:
        student = upsert_user(
            db,
            username=STUDENT_USERNAME,
            password=STUDENT_PASSWORD,
            first_name="Aarav",
            last_name="Mehta",
            email="student.test@cerbyl.local",
            role="student",
        )
        educator = upsert_user(
            db,
            username=EDUCATOR_USERNAME,
            password=EDUCATOR_PASSWORD,
            first_name="Dr. Maya",
            last_name="Rao",
            email="teacher.test@cerbyl.local",
            role="educator",
        )

        supporting_students = []
        for index, (first_name, last_name) in enumerate(
            [
                ("Riya", "Shah"),
                ("Kabir", "Singh"),
                ("Ananya", "Iyer"),
                ("Vihaan", "Patel"),
            ],
            start=1,
        ):
            supporting_students.append(
                upsert_user(
                    db,
                    username=f"cerbyl.demo.student{index}",
                    password=f"SupportingStudent#{index}2026",
                    first_name=first_name,
                    last_name=last_name,
                    email=f"demo.student{index}@cerbyl.local",
                    role="student",
                )
            )

        organization = get_or_create(
            db,
            models.Organization,
            slug=ORGANIZATION_SLUG,
            defaults={
                "name": "Cerbyl Demo Institute",
                "institution_type": "university",
                "status": "active",
            },
        )
        organization.name = "Cerbyl Demo Institute"

        for member, role in [
            (student, "student"),
            (educator, "educator"),
            *((support, "student") for support in supporting_students),
        ]:
            membership = get_or_create(
                db,
                models.OrganizationMembership,
                organization_id=organization.id,
                user_id=member.id,
                defaults={"role": role, "status": "active"},
            )
            membership.role = role
            membership.status = "active"

        today = date.today()
        term = get_or_create(
            db,
            models.AcademicTerm,
            organization_id=organization.id,
            name="Demo Semester 2026",
            defaults={
                "starts_on": today - timedelta(days=45),
                "ends_on": today + timedelta(days=75),
                "is_current": True,
            },
        )
        term.starts_on = today - timedelta(days=45)
        term.ends_on = today + timedelta(days=75)
        term.is_current = True

        course_specs = [
            (
                "CS201",
                "Data Structures",
                "Computer Science",
                "Mon & Wed · 10:00 AM",
                "Lab 3",
                68,
                72,
            ),
            (
                "MATH204",
                "Linear Algebra",
                "Mathematics",
                "Tue & Thu · 11:30 AM",
                "Room 204",
                54,
                58,
            ),
            (
                "PHY112",
                "Applied Physics",
                "Sciences",
                "Mon · 2:00 PM",
                "Science 2",
                82,
                84,
            ),
            (
                "ENG105",
                "Academic Communication",
                "Humanities",
                "Fri · 9:00 AM",
                "Room 108",
                91,
                88,
            ),
        ]
        section_rows = []
        for (
            code,
            title,
            department,
            schedule,
            room,
            progress,
            mastery,
        ) in course_specs:
            course = get_or_create(
                db,
                models.Course,
                organization_id=organization.id,
                code=code,
                defaults={
                    "title": title,
                    "description": f"Demo course workspace for {title}.",
                    "department": department,
                    "created_by": educator.id,
                },
            )
            course.title = title
            course.department = department
            course.created_by = educator.id
            section = get_or_create(
                db,
                models.ClassSection,
                course_id=course.id,
                academic_term_id=term.id,
                name="Section A",
                defaults={
                    "schedule_text": schedule,
                    "room": room,
                    "instructor_id": educator.id,
                    "status": "active",
                },
            )
            section.schedule_text = schedule
            section.room = room
            section.instructor_id = educator.id
            section.status = "active"
            section_rows.append((section, progress, mastery))

            material = get_or_create(
                db,
                models.CourseMaterial,
                course_id=course.id,
                title=f"{title} course guide",
                defaults={
                    "material_type": "document",
                    "status": "published",
                    "created_by": educator.id,
                },
            )
            material.source_url = f"https://cerbyl.local/courses/{code.lower()}/guide"

        all_students = [student, *supporting_students]
        progress_offsets = [0, -22, -8, 7, 12]
        mastery_offsets = [0, -28, -13, 8, 14]
        for section, base_progress, base_mastery in section_rows:
            for index, enrolled_student in enumerate(all_students):
                enrollment = get_or_create(
                    db,
                    models.Enrollment,
                    section_id=section.id,
                    student_id=enrolled_student.id,
                    defaults={"status": "active"},
                )
                enrollment.status = "active"
                enrollment.progress_percent = max(
                    12, min(98, base_progress + progress_offsets[index])
                )
                enrollment.mastery_percent = max(
                    18, min(97, base_mastery + mastery_offsets[index])
                )
                enrollment.last_active_at = utc_now() - timedelta(
                    hours=(index * 7) + (section.id % 3)
                )

        assignment_specs = [
            (0, "Trees and graph traversal", "practice", 2, 35, "guided"),
            (0, "Complexity analysis checkpoint", "quiz", 6, 25, "restricted"),
            (1, "Eigenvalues problem set", "problem_set", 1, 45, "guided"),
            (1, "Vector spaces mastery check", "quiz", 5, 30, "restricted"),
            (2, "Wave interference lab reflection", "reflection", 3, 25, "open"),
            (3, "Research abstract revision", "writing", 4, 40, "guided"),
        ]
        assignments = []
        for (
            section_index,
            title,
            assignment_type,
            due_in_days,
            minutes,
            ai_policy,
        ) in assignment_specs:
            section = section_rows[section_index][0]
            assignment = get_or_create(
                db,
                models.Assignment,
                section_id=section.id,
                title=title,
                defaults={
                    "description": f"Complete the {title.lower()} activity and submit your work.",
                    "assignment_type": assignment_type,
                    "due_at": utc_now() + timedelta(days=due_in_days),
                    "points_possible": 100,
                    "estimated_minutes": minutes,
                    "status": "published",
                    "ai_policy": ai_policy,
                    "created_by": educator.id,
                },
            )
            assignment.due_at = utc_now() + timedelta(days=due_in_days)
            assignment.status = "published"
            assignment.estimated_minutes = minutes
            assignments.append(assignment)

        db.flush()
        # The test student has completed two items; the rest remain actionable.
        for assignment, score in [(assignments[0], 78), (assignments[4], 86)]:
            submission = get_or_create(
                db,
                models.Submission,
                assignment_id=assignment.id,
                student_id=student.id,
                defaults={},
            )
            submission.status = "graded"
            submission.content_text = (
                f"My completed response for {assignment.title}. "
                "I explained the method, showed the key steps, and checked the result."
            )
            submission.attempt_number = 1
            submission.score = score
            submission.submitted_at = utc_now() - timedelta(days=1)
            submission.feedback = "Good progress. Review the highlighted concept once more."
            submission.graded_at = utc_now() - timedelta(hours=12)
            submission.graded_by = educator.id

        # Populate an educator review queue without exposing extra login credentials.
        for student_index, support in enumerate(supporting_students):
            for assignment_index, assignment in enumerate(assignments[:4]):
                if (student_index + assignment_index) % 3 == 0:
                    continue
                submission = get_or_create(
                    db,
                    models.Submission,
                    assignment_id=assignment.id,
                    student_id=support.id,
                    defaults={},
                )
                submission.status = (
                    "submitted"
                    if (student_index + assignment_index) % 2
                    else "graded"
                )
                submission.content_text = (
                    f"Completed response for {assignment.title}. "
                    "The solution includes the main reasoning and final result."
                )
                submission.attempt_number = 1
                submission.score = (
                    None
                    if submission.status == "submitted"
                    else 56 + (student_index * 8) + assignment_index
                )
                submission.feedback = (
                    None
                    if submission.status == "submitted"
                    else "Clear reasoning. Recheck the final step for precision."
                )
                submission.submitted_at = utc_now() - timedelta(
                    hours=student_index + assignment_index + 2
                )
                submission.graded_at = (
                    None
                    if submission.status == "submitted"
                    else utc_now() - timedelta(hours=student_index + 1)
                )
                submission.graded_by = (
                    None if submission.status == "submitted" else educator.id
                )

        announcement_specs = [
            (
                0,
                "Office hours moved",
                "This week's office hours will be held in Lab 3 after Wednesday's class.",
            ),
            (
                1,
                "Revision set available",
                "A short revision set is ready before the vector spaces mastery check.",
            ),
            (
                2,
                "Bring your lab notes",
                "Please bring your observations from the interference experiment.",
            ),
        ]
        for section_index, title, body in announcement_specs:
            section = section_rows[section_index][0]
            announcement = get_or_create(
                db,
                models.Announcement,
                section_id=section.id,
                title=title,
                defaults={
                    "author_id": educator.id,
                    "body": body,
                    "published_at": utc_now()
                    - timedelta(hours=section_index * 5 + 1),
                },
            )
            announcement.author_id = educator.id
            announcement.body = body

            activity = get_or_create(
                db,
                models.ClassActivityEvent,
                section_id=section.id,
                event_type="announcement_published",
                entity_type="announcement",
                entity_id=announcement.id,
                defaults={
                    "actor_id": educator.id,
                    "title": title,
                    "detail": body,
                    "visible_to_students": True,
                    "created_at": announcement.published_at,
                },
            )
            activity.actor_id = educator.id
            activity.title = title
            activity.detail = body
            activity.visible_to_students = True

        attendance_statuses = ["present", "present", "late", "present", "absent"]
        for days_ago in (0, 2, 4, 7, 9):
            class_date = today - timedelta(days=days_ago)
            for section, _, _ in section_rows:
                for student_index, enrolled_student in enumerate(all_students):
                    record = get_or_create(
                        db,
                        models.AttendanceRecord,
                        section_id=section.id,
                        student_id=enrolled_student.id,
                        class_date=class_date,
                        defaults={
                            "status": attendance_statuses[
                                (student_index + days_ago) % len(attendance_statuses)
                            ],
                            "marked_by": educator.id,
                            "marked_at": utc_now(),
                        },
                    )
                    record.status = attendance_statuses[
                        (student_index + days_ago) % len(attendance_statuses)
                    ]
                    record.marked_by = educator.id

        db.commit()
        db.refresh(student)
        db.refresh(educator)
        db.refresh(organization)
        return student, educator, organization
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seeded_student, seeded_educator, seeded_organization = seed()
    print("Cerbyl institution demo ready.")
    print(
        f"Student: id={seeded_student.id} username={STUDENT_USERNAME} "
        f"password={STUDENT_PASSWORD}"
    )
    print(
        f"Educator: id={seeded_educator.id} username={EDUCATOR_USERNAME} "
        f"password={EDUCATOR_PASSWORD}"
    )
    print(
        f"Organization: id={seeded_organization.id} "
        f"slug={seeded_organization.slug}"
    )
