from datetime import date, datetime

from pydantic import AnyHttpUrl, BaseModel, Field, ConfigDict, model_validator


class ClassroomInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)


class AssignmentCreate(ClassroomInput):
    section_id: int
    title: str = Field(min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    assignment_type: str = Field(default="practice", max_length=30)
    due_at: datetime | None = None
    points_possible: float = Field(default=100, gt=0, le=1000)
    estimated_minutes: int = Field(default=30, ge=5, le=600)
    ai_policy: str = Field(default="guided", pattern="^(guided|open|restricted)$")
    rubric_text: str | None = Field(default=None, max_length=10000)
    weight_percent: float = Field(default=0, ge=0, le=100)
    start_at: datetime | None = None
    allow_resubmission: bool = True
    max_attempts: int = Field(default=3, ge=1, le=20)
    status: str = Field(default="published", pattern="^(draft|published)$")


class AssignmentUpdate(ClassroomInput):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    assignment_type: str | None = Field(default=None, max_length=30)
    due_at: datetime | None = None
    start_at: datetime | None = None
    points_possible: float | None = Field(default=None, gt=0, le=1000)
    estimated_minutes: int | None = Field(default=None, ge=5, le=600)
    ai_policy: str | None = Field(default=None, pattern="^(guided|open|restricted)$")
    rubric_text: str | None = Field(default=None, max_length=10000)
    weight_percent: float | None = Field(default=None, ge=0, le=100)
    allow_resubmission: bool | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=20)
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")


    @model_validator(mode="after")
    def required_values(self):
        nullable = {"description", "due_at", "start_at", "rubric_text"}
        for field in self.model_fields_set - nullable:
            if getattr(self, field) is None:
                raise ValueError(f"{field.replace('_', ' ')} cannot be empty.")
        return self


class SubmissionCreate(ClassroomInput):
    content_text: str = Field(default="", max_length=20000)
    attachment_url: AnyHttpUrl | None = None


class SubmissionDraft(ClassroomInput):
    content_text: str = Field(default="", max_length=20000)
    attachment_url: AnyHttpUrl | None = None


class AnnouncementCreate(ClassroomInput):
    section_id: int
    title: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=3, max_length=5000)


class GradeSubmission(ClassroomInput):
    score: float = Field(ge=0)
    feedback: str = Field(min_length=3, max_length=5000)


class AttendanceEntry(BaseModel):
    student_id: int
    status: str = Field(pattern="^(present|late|absent|excused)$")
    note: str | None = Field(default=None, max_length=300)


class AttendanceUpdate(BaseModel):
    class_date: date
    entries: list[AttendanceEntry] = Field(min_length=1, max_length=500)


class CourseMaterialCreate(ClassroomInput):
    title: str = Field(min_length=3, max_length=180)
    material_type: str = Field(
        default="document",
        pattern="^(document|video|slides|link)$",
    )
    source_url: AnyHttpUrl


class ClassroomMessageCreate(ClassroomInput):
    section_id: int
    recipient_id: int
    assignment_id: int | None = None
    subject: str = Field(min_length=3, max_length=180)
    body: str = Field(min_length=3, max_length=5000)
