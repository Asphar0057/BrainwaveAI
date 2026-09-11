# Instructor pilot — ready to schedule, not yet run

Participants and start date have not been supplied. Automated demo activity is not a customer pilot.

Proposed scope: one instructor, 5–10 consenting students, one subject, two comparable assignments over 14 days. Confirm the cohort and timing with the instructor before launch. Use individual accounts, not the shared demo credentials.

Day 0: observe the instructor preparing and grading a comparable assignment in their existing process. Record actual minutes and the number of students/answers handled. Explain the distinction between teacher-approved checkpoints and generated tutor suggestions.

Days 1–3: create the class; enroll students; publish a source material and a clear assignment with a rubric. Ask each student to open the material, save a draft, submit, and find their feedback. Record any task where help was required.

Days 4–7: instructor publishes feedback and assigns one targeted follow-up. Observe how long review and feedback take. Have the instructor review every generated explanation used in class.

Days 8–14: publish a second comparable assignment. Observe whether students return without individual reminders. Repeat the teacher time measurement with the same task scope.

Capture each comparable teacher task in teacher-time.csv. Leave unknown values blank; do not estimate savings from AI latency. The report calculates savings including negative values.

Generate the scorecard with:

```sh
python backend/scripts/b2b_pilot_report.py --section-id YOUR_CLASS_ID --days 14 --teacher-time-csv output/b2b-workflow-audit/pilot/teacher-time.csv --out output/real-pilot
```

Working decision criteria (proposed, not industry benchmarks): at least 80% assignment completion; at least 60% of active learners complete meaningful work on multiple days; at least 20% less teacher time on comparable tasks; no privacy or grading blockers. Inspect the denominators and actual task observations before deciding. With 5–10 students, results are directional, not proof of market demand.

Interview prompts: Where did you need help? Which feedback changed your next answer? What still takes too long? Would the instructor use this for the next cohort and pay for it? Record the proposed price and an actual purchasing commitment separately from satisfaction.

Stop and fix any lost work, incorrect grade, exposed private work, or inaccessible required action before enrolling a larger group.
