# Cerbyl B2B Student and Teacher/Professor Features

## Implemented Connected Classroom Architecture

### Role entry and isolation

- Learner accounts land on `/dashboard-cerbyl`.
- Student accounts land on `/student`.
- Teacher and professor accounts use the normalized `educator` role and land on `/educator`.
- `/workspace` resolves the signed-in role before routing.
- Student and educator routes use role-protected guards.
- Session caches are bound to both the active username and access token.
- Signing out clears the previous account's profile, picture, role, institution, and dashboard state.
- Student and educator profiles share the Cerbyl Learner profile layout without billing, subscription, payment, upgrade, or usage surfaces.

### Shared class domain

```text
Organization
  └── Academic term
      └── Course
          └── Class section
              ├── Educator
              ├── Enrollments → Students
              ├── Assignments → Submissions → Grades and feedback
              ├── Course materials
              ├── Announcements
              ├── Attendance records
              └── Class activity events
```

The class section is the permission and synchronization boundary. Every student read is restricted to an active enrollment. Every educator write is restricted to a section assigned to that educator.

### Connected teacher-to-student flow

1. The educator publishes an assignment to one class section.
2. It appears immediately in the dashboards and class workspace of students enrolled in that section.
3. A student can save a private draft, submit work, or resubmit after feedback.
4. The educator review queue receives submitted work from the same section.
5. Publishing a score and written feedback updates that student's submission.
6. Course progress and mastery are recalculated.
7. The class leaderboard is recalculated from mastery, progress, grade average, and completion.
8. The graded state and feedback appear in the student's class workspace.

### Additional synchronized flows

- Announcements published by an educator appear only for students enrolled in the target section.
- Materials published by an educator appear in the shared class Materials tab.
- Attendance marked by an educator appears as a private attendance summary for the individual student.
- Class activity provides an auditable timeline; private submission events remain educator-only.
- Students never receive a class roster. Educators can inspect the roster for their own sections.

### API surface

- `GET /api/institution/session`
- `GET /api/institution/student/dashboard`
- `GET /api/institution/educator/dashboard`
- `GET /api/institution/sections/{section_id}`
- `GET /api/institution/sections/{section_id}/leaderboard`
- `PUT /api/institution/student/assignments/{assignment_id}/draft`
- `POST /api/institution/student/assignments/{assignment_id}/submit`
- `POST /api/institution/educator/assignments`
- `GET /api/institution/educator/assignments/{assignment_id}/submissions`
- `PATCH /api/institution/educator/submissions/{submission_id}/grade`
- `POST /api/institution/educator/announcements`
- `POST /api/institution/educator/sections/{section_id}/materials`
- `PUT /api/institution/educator/sections/{section_id}/attendance`

### Production architecture boundaries

- FastAPI owns authorization, validation, classroom calculations, and persistence.
- SQLAlchemy models provide shared institutional domain entities.
- Alembic migrations version every classroom schema change.
- React dashboards consume role-shaped APIs and do not infer permissions client-side.
- Shared class UI uses the same Cerbyl visual system with role-specific controls.
- PostgreSQL is required in production; SQLite is limited to local development and demos.
- Every mutating API validates section access again on the server.

## 1. Product Structure

- Build one shared platform with role-based workspaces.
- Provide a Student Workspace for learning and completing assigned work.
- Provide a Teacher/Professor Workspace for managing courses, content, assignments, students, and learning outcomes.
- Use the same authentication, backend services, database, course data, and AI learning engine.
- Allow users with multiple roles to switch workspaces.
- Keep the student experience mobile-friendly.
- Optimize teacher and professor workflows for desktop and tablet.

---

# 2. Student Workspace Features

## 2.1 Student Dashboard

- Show today's classes.
- Show upcoming assignments.
- Show overdue assignments.
- Show upcoming quizzes and exams.
- Show teacher announcements.
- Show flashcards due for review.
- Show recommended weak-area practice.
- Show the student's current learning streak.
- Show weekly study progress.
- Show recently opened courses and materials.
- Provide a "Continue studying" action.
- Provide quick access to the AI Tutor.
- Provide quick access to notes, quizzes, flashcards, and progress.

## 2.2 My Classes

- Display all enrolled classes.
- Show the teacher or professor for each class.
- Show the class schedule.
- Show current class progress.
- Show unread announcements.
- Show the next assignment for each class.
- Allow students to open a dedicated class workspace.

## 2.3 Class Workspace

- Show the class overview.
- Show the syllabus.
- Show teacher contact and office-hour information.
- Show weekly modules.
- Show units and chapters.
- Show learning outcomes.
- Show teacher-approved learning materials.
- Show PDFs, slides, videos, links, and documents.
- Show class assignments.
- Show quizzes and assessments.
- Show class announcements.
- Show class-specific notes.
- Show class flashcards.
- Show the student's class mastery map.
- Provide access to the class-specific AI Tutor.
- Provide access to class discussions when enabled.

## 2.4 Course-Grounded AI Tutor

- Use the active class as the tutor context.
- Prioritize teacher-approved course materials.
- Cite the source used in an answer.
- Cite specific slides, chapters, pages, or documents.
- Follow teacher-configured AI rules.
- Follow assignment-specific AI restrictions.
- Adjust explanations based on student mastery.
- Support Socratic tutoring.
- Support direct explanation mode when allowed.
- Provide hints without revealing the final answer.
- Explain concepts in simpler language.
- Provide step-by-step explanations.
- Provide examples.
- Provide analogies.
- Provide prerequisite explanations.
- Ask students questions to check understanding.
- Generate short practice questions.
- Generate diagrams and knowledge maps.
- Support multiple languages.
- Convert a tutor conversation into notes.
- Convert a tutor conversation into flashcards.
- Create a quiz from a tutor conversation.
- Save important tutor responses.
- Allow students to report an incorrect or unsafe response.

## 2.5 Assignments

- Show all assigned work.
- Filter assignments by class.
- Filter assignments by status.
- Show assignment instructions.
- Show learning objectives.
- Show assigned resources.
- Show start and due dates.
- Show estimated completion time.
- Show marks and grade weight.
- Show the assignment rubric.
- Clearly show whether AI assistance is allowed.
- Allow students to start, save, and continue work.
- Support text submissions.
- Support file submissions.
- Support quiz submissions.
- Support note submissions.
- Support project submissions.
- Support AI tutoring assignments.
- Support flashcard review assignments.
- Support learning-path assignments.
- Support group assignments.
- Show submission status.
- Show attempt history.
- Show late submission status.
- Show teacher feedback.
- Show grades.
- Show question-level results.
- Support resubmission when allowed.

## 2.6 Practice Center

- Show teacher-assigned practice.
- Show personalized weak-area practice.
- Support solo quizzes.
- Support flashcard review.
- Support spaced repetition.
- Generate practice from class materials.
- Generate practice from personal notes.
- Provide exam-preparation mode.
- Provide timed practice.
- Provide untimed practice.
- Provide hints.
- Provide answer explanations.
- Allow students to retry incorrect questions.
- Ask students to rate their confidence.
- Recommend prerequisite practice.
- Create a daily review plan.
- Track practice accuracy.
- Track mastery improvement.

## 2.7 Notes and Study Library

- Create personal notes.
- Create class-linked notes.
- Create AI-assisted notes.
- Import notes from documents.
- Create notes from audio.
- Create notes from video.
- Analyze uploaded slides.
- Save tutor conversations.
- Create flashcard sets.
- Create question sets.
- Create study playlists.
- Search across personal content.
- Search across class content.
- Organize content into folders.
- Mark content as favorite.
- Show whether content is private.
- Show whether content is shared with a teacher.
- Show whether content is shared with a class.
- Show whether content was submitted as an assignment.

## 2.8 Student Progress

- Show mastery by class.
- Show mastery by unit.
- Show mastery by concept.
- Show strong concepts.
- Show weak concepts.
- Show concepts currently being developed.
- Show assignment completion.
- Show quiz performance.
- Show practice performance.
- Show flashcard retention.
- Show study consistency.
- Show time spent learning.
- Show improvement over time.
- Show teacher feedback history.
- Show upcoming review workload.
- Show recommended next actions.
- Explain why a concept is marked as weak.
- Allow students to set study goals.
- Allow students to track personal goals.

## 2.9 Communication

- Receive class announcements.
- Receive assignment reminders.
- Receive deadline reminders.
- Receive grade notifications.
- Receive feedback notifications.
- Send a private message to the teacher.
- Ask a private class-related question.
- Post a question to the class when enabled.
- Comment on assignments when enabled.
- View teacher office hours.
- Receive group-study invitations.
- Receive intervention recommendations.

## 2.10 Student Profile and Settings

- Manage personal information.
- View enrolled classes.
- Configure preferred language.
- Configure accessibility settings.
- Configure notification preferences.
- Configure tutor explanation preferences.
- Configure study-session preferences.
- View privacy settings.
- Manage guardian connections for school accounts.
- Request a personal data export.
- Request account deletion where permitted.

---

# 3. Teacher/Professor Workspace Features

## 3.1 Teacher Dashboard

- Show today's classes.
- Show upcoming teaching sessions.
- Show assignments awaiting review.
- Show missing submissions.
- Show upcoming deadlines.
- Show unread student questions.
- Show recent class activity.
- Show class mastery summaries.
- Show common misconceptions.
- Show students who may need attention.
- Show students who are improving.
- Show students ready for enrichment.
- Provide an AI-generated weekly class briefing.
- Provide quick actions for common tasks.
- Provide a quick action to create an assignment.
- Provide a quick action to upload material.
- Provide a quick action to generate a quiz.
- Provide a quick action to post an announcement.
- Provide a quick action to start a live activity.

## 3.2 Courses and Class Sections

- Create a course.
- Import an existing course.
- Create multiple class sections.
- Assign a course to an academic term.
- Add a course schedule.
- Add a classroom or meeting link.
- Upload a syllabus.
- Invite students by email.
- Invite students with a class code.
- Import a student roster.
- Add co-teachers.
- Add teaching assistants.
- Assign section-specific permissions.
- Copy a course for a new semester or academic year.
- Archive completed classes.
- Restore archived classes.
- View enrollment status.
- Remove or deactivate students.

## 3.3 Curriculum and Module Builder

- Create course units.
- Create weekly modules.
- Create lessons.
- Reorder units, modules, and lessons.
- Add learning outcomes.
- Add prerequisite concepts.
- Map materials to learning outcomes.
- Map assessments to learning outcomes.
- Define expected course progression.
- Create a course knowledge map.
- Set module release dates.
- Lock future modules.
- Copy modules between classes.
- Collaborate with other teachers.
- Save module templates.
- Publish or unpublish modules.

## 3.4 Course Material Manager

- Upload PDFs.
- Upload presentations.
- Upload documents.
- Upload audio files.
- Upload video files.
- Add external links.
- Import LMS materials.
- Organize materials by unit and module.
- Mark materials as required.
- Mark materials as optional.
- Save materials as drafts.
- Publish materials to students.
- Publish materials to selected class sections.
- Schedule material publication.
- Replace outdated material.
- Maintain content version history.
- Add teacher notes to materials.
- Add accessibility descriptions.
- Control downloading and sharing.

## 3.5 Teacher AI Content Studio

- Generate lesson plans.
- Generate lecture outlines.
- Generate presentation slides.
- Generate guided notes.
- Generate reading summaries.
- Generate vocabulary lists.
- Generate examples.
- Generate case studies.
- Generate flashcards.
- Generate question banks.
- Generate quizzes.
- Generate homework.
- Generate revision packs.
- Generate exit tickets.
- Generate discussion prompts.
- Generate remediation activities.
- Generate advanced activities.
- Generate audio lessons.
- Generate differentiated versions of content.
- Select target difficulty.
- Select target age or academic level.
- Select learning outcomes.
- Generate only from approved sources.
- Show sources used for generation.
- Save generated content as a draft.
- Require teacher review before publication.
- Edit all AI-generated content.
- Track content versions and approvals.

## 3.6 Assignment Builder

- Create an assignment.
- Select the assignment type.
- Add instructions.
- Add learning objectives.
- Attach course materials.
- Assign work to an entire class.
- Assign work to selected groups.
- Assign work to individual students.
- Set start and due dates.
- Set estimated completion time.
- Set marks and grade weight.
- Set the number of attempts.
- Add a time limit.
- Randomize questions.
- Add a rubric.
- Configure late-submission rules.
- Configure resubmission rules.
- Configure feedback release.
- Configure grade release.
- Configure AI-assistance rules.
- Restrict students to approved sources.
- Select automatic or manual grading.
- Save assignments as drafts.
- Schedule assignment publication.
- Copy assignments between classes.
- Create assignment templates.

## 3.7 Assignment Types

- Quiz assignment.
- Question-set assignment.
- Flashcard-review assignment.
- AI tutoring assignment.
- Written-response assignment.
- Note-taking assignment.
- File-submission assignment.
- Learning-path assignment.
- Video or slide analysis assignment.
- Reflection assignment.
- Project assignment.
- Group assignment.
- Live classroom assignment.

## 3.8 AI Assistance Controls

- Disable AI assistance.
- Allow hints only.
- Allow Socratic guidance.
- Allow explanations without final answers.
- Allow full tutor assistance.
- Restrict assistance to teacher-approved sources.
- Set different AI rules for different assignments.
- Set different AI rules for different students when required.
- Show students the active AI policy.
- Record which AI mode was used.
- Allow the teacher to review AI assistance associated with submitted work when policy permits.

## 3.9 Question and Assessment Builder

- Create questions manually.
- Generate questions from course materials.
- Import existing questions.
- Create multiple-choice questions.
- Create true-or-false questions.
- Create fill-in-the-blank questions.
- Create short-answer questions.
- Create long-answer questions.
- Create numerical questions.
- Create diagram-based questions.
- Create oral-assessment prompts.
- Set question difficulty.
- Add answer explanations.
- Add hints.
- Map questions to learning outcomes.
- Tag questions by concept.
- Add questions to a shared question bank.
- Randomize question order.
- Randomize answer choices.
- Create different assessment versions.
- Preview assessments as a student.
- Track question performance.
- Retire or update poor questions.

## 3.10 Submission and Grading Center

- View all submissions.
- Filter by class.
- Filter by assignment.
- Filter by submission status.
- Filter late submissions.
- Automatically grade objective questions.
- Grade written work manually.
- Grade using rubrics.
- Generate AI-assisted feedback drafts.
- Edit AI-generated feedback.
- Approve feedback before release.
- Provide question-level feedback.
- Provide overall feedback.
- Provide private teacher notes.
- Grade multiple submissions in sequence.
- Apply batch feedback.
- Override automatic grades.
- Regrade questions.
- Return work for resubmission.
- Release grades immediately.
- Schedule grade release.
- Export grades.
- Pass grades back to an LMS in a later integration phase.

## 3.11 Class Analytics

- Show assignment completion.
- Show average class score.
- Show score distribution.
- Show concept mastery.
- Show unit mastery.
- Show learning-outcome performance.
- Show question difficulty.
- Show common incorrect answers.
- Show common misconceptions.
- Show students requesting repeated hints.
- Show students who have stopped participating.
- Show students rushing through activities.
- Show improvement after practice.
- Show improvement after teacher intervention.
- Show flashcard retention.
- Show class study activity.
- Compare the teacher's own class sections.
- Export class reports.

## 3.12 Student Intervention Center

- Identify students repeatedly failing prerequisites.
- Identify students with declining performance.
- Identify students with missing work.
- Identify students with low predicted retention.
- Identify students showing improvement.
- Identify students ready for enrichment.
- Prioritize students by intervention urgency.
- Assign personalized practice.
- Assign prerequisite material.
- Assign a remediation learning path.
- Send a private message.
- Recommend office hours.
- Extend an assignment deadline.
- Create a study group.
- Notify an advisor or counselor when permitted.
- Add an intervention note.
- Track whether the student completed the intervention.
- Measure whether the intervention improved mastery.

## 3.13 Individual Student View

- Show assignment history.
- Show submission history.
- Show grades.
- Show concept mastery.
- Show strong areas.
- Show weak areas.
- Show teacher feedback history.
- Show intervention history.
- Show learning-path progress.
- Show approved accommodation information.
- Show recent class-related activity.
- Show recommended teaching actions.
- Protect private student notes.
- Protect unrelated private AI conversations.

## 3.14 Announcements and Communication

- Post class announcements.
- Schedule announcements.
- Edit announcements.
- Pin important announcements.
- Send messages to an entire class.
- Send messages to selected groups.
- Send private student messages.
- Reply to assignment comments.
- Manage a class question board.
- Publish office hours.
- Send automatic deadline reminders.
- Send guardian summaries in school mode.
- Control whether students can post publicly.

## 3.15 Live Classroom Features

- Start a join-code quiz.
- Start a live poll.
- Start an anonymous understanding check.
- Start a team quiz.
- Start an exit ticket.
- Open a student question wall.
- Use teacher-paced questions.
- Use student-paced questions.
- View responses in real time.
- View misconceptions in real time.
- Pause the activity for reteaching.
- Save results to the class record.
- Convert live results into follow-up practice.

## 3.16 Teacher Settings

- Manage co-teachers.
- Manage teaching assistants.
- Manage class permissions.
- Configure AI tutor behavior.
- Configure student AI access.
- Configure social features.
- Configure public sharing.
- Configure grading rules.
- Configure assignment defaults.
- Configure notifications.
- Configure content-sharing rules.
- Configure data-export options.
- Configure LMS integrations in a later phase.

---

# 4. Shared Features Connecting Students and Teachers

## 4.1 Shared Class

- Teachers create or import a class.
- Students join through enrollment, roster import, email invitation, or class code.
- Both roles access the same class structure.
- Each role receives an interface appropriate to its permissions.

## 4.2 Shared Modules

- Teachers create and publish modules.
- Students see published modules.
- Students do not see unpublished drafts.
- Teachers can schedule module access.
- Student progress is connected to the module.

## 4.3 Shared Materials

- Teachers upload and approve materials.
- Students access published materials.
- The class AI Tutor uses approved materials.
- Teachers can replace or update materials.
- Students receive updated versions without losing personal notes.

## 4.4 Shared Assignments

- Teachers create and assign work.
- Students receive the assignment.
- Students complete and submit it.
- Teachers review and grade it.
- Students receive feedback and grades.
- Assignment performance updates student mastery.

## 4.5 Shared Assessments

- Teachers create or generate assessments.
- Students complete assessments.
- Cerbyl grades eligible questions.
- Teachers review results.
- Students receive approved explanations and feedback.
- Class analytics update from assessment results.

## 4.6 Shared Flashcards

- Teachers create or assign flashcard sets.
- Students review cards.
- Cerbyl schedules reviews using spaced repetition.
- Teachers see class-level retention.
- Students see personal review progress.

## 4.7 Shared Learning Paths

- Teachers define learning outcomes and progression.
- Cerbyl creates a course learning path.
- Students receive personalized next steps.
- Teachers see where students are blocked.
- Teachers assign targeted remediation.

## 4.8 Shared Announcements

- Teachers publish announcements.
- Students receive dashboard and notification updates.
- Teachers can schedule or pin announcements.
- Students can acknowledge important announcements when required.

## 4.9 Shared Feedback

- Teachers grade or comment on student work.
- Students receive feedback.
- Students can revise and resubmit when allowed.
- Cerbyl recommends follow-up activities.
- Teachers can measure improvement after feedback.

## 4.10 Shared Mastery Data

- Student activity creates learning evidence.
- Cerbyl updates individual concept mastery.
- Students see their personal mastery.
- Teachers see class and permitted student-level mastery.
- Teachers assign interventions based on mastery gaps.
- Intervention results update the mastery model.

## 4.11 Shared Communication

- Teachers send announcements and messages.
- Students ask questions.
- Teachers respond privately or to the class.
- Assignment conversations remain connected to the assignment.
- Communication follows institution permissions.

---

# 5. Connected Teaching and Learning Flow

1. Teacher creates a course and class section.
2. Teacher adds students or imports a roster.
3. Teacher uploads the syllabus and course materials.
4. Cerbyl identifies concepts, prerequisites, and learning outcomes.
5. Teacher reviews and approves the generated course structure.
6. Teacher publishes modules and materials.
7. Student opens the class workspace.
8. Student studies using materials, notes, flashcards, quizzes, and the AI Tutor.
9. Teacher creates and publishes an assignment.
10. Student completes and submits the assignment.
11. Cerbyl records learning evidence.
12. Teacher reviews submissions and class analytics.
13. Cerbyl identifies common misconceptions and individual learning gaps.
14. Teacher assigns targeted intervention or enrichment.
15. Student completes the follow-up activity.
16. Cerbyl measures mastery improvement.
17. Teacher and student see updated progress.

---

# 6. Shared Data and Backend Requirements

## 6.1 Core Entities

- Organization.
- Organization membership.
- User.
- User role.
- Permission.
- Course.
- Class section.
- Enrollment.
- Academic term.
- Course module.
- Lesson.
- Course material.
- Learning outcome.
- Concept.
- Assignment.
- Assignment target.
- Submission.
- Submission attempt.
- Rubric.
- Grade.
- Teacher feedback.
- Announcement.
- Class message.
- Concept mastery.
- Intervention.
- Notification.
- Audit event.

## 6.2 Core Relationships

```text
Organization
└── Course
    └── Class Section
        ├── Teachers and Teaching Assistants
        ├── Students
        ├── Modules and Lessons
        ├── Course Materials
        ├── Assignments
        │   └── Student Submissions
        ├── Announcements
        └── Mastery and Intervention Records
```

## 6.3 Content Visibility

- Personal and private.
- Shared with a teacher.
- Shared with selected students.
- Shared with a class.
- Shared with an organization.
- Public, only when institution policy permits.
- Submitted as an assignment.
- Published by a teacher.
- Draft and visible only to teaching staff.

## 6.4 Permission Requirements

- Students can access only enrolled classes.
- Teachers can access only assigned classes.
- Teaching assistants receive limited permissions.
- Teachers cannot automatically access private student content.
- Students cannot access teacher drafts.
- Students cannot access other students' grades.
- All privileged actions must be checked by the backend.
- Important grading and permission changes must be logged.

---

# 7. Recommended MVP

## 7.1 Student MVP

- Student dashboard.
- My Classes.
- Class workspace.
- Modules and materials.
- Course-grounded AI Tutor.
- Assignment list.
- Assignment submission.
- Quizzes.
- Teacher-assigned flashcards.
- Personal mastery view.
- Announcements.
- Notifications.
- Teacher feedback.

## 7.2 Teacher/Professor MVP

- Teacher dashboard.
- Course and class creation.
- Student invitations and enrollment.
- Course material upload.
- Module builder.
- Assignment builder.
- Quiz generator.
- Submission review.
- Grading and feedback.
- Class mastery dashboard.
- Student intervention list.
- Announcements.
- Basic AI policy controls.

## 7.3 Shared MVP Infrastructure

- Student and teacher roles.
- Role-based navigation.
- Organization support.
- Courses and class sections.
- Enrollments.
- Content visibility.
- Assignment lifecycle.
- Course-specific AI context.
- Mastery records.
- Notifications.
- Backend permission enforcement.
- Audit history for grades and permissions.

---

# 8. Recommended Navigation

## 8.1 Student Navigation

- Today.
- Classes.
- Tutor.
- Practice.
- Library.
- Progress.

## 8.2 Teacher/Professor Navigation

- Home.
- Classes.
- Content.
- Assignments.
- Students.
- Insights.

    
