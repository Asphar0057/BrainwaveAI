from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, UniqueConstraint
from database import Base


class ProductEvent(Base):
    __tablename__ = "product_events"
    id = Column(Integer, primary_key=True)
    event_key = Column(String(120), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    visitor_id = Column(String(36), index=True)
    name = Column(String(50), nullable=False, index=True)
    origin = Column(String(12), nullable=False, default="server")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


class AnswerReport(Base):
    __tablename__ = "answer_reports"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_type = Column(String(30), nullable=False)
    resource_id = Column(Integer, nullable=False)
    reason = Column(String(40), nullable=False)
    detail = Column(Text, nullable=False, default="")
    snapshot = Column(JSON, nullable=False)
    status = Column(String(20), nullable=False, default="open")
    resolution = Column(Text)
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime)
    __table_args__ = (UniqueConstraint("user_id", "resource_type", "resource_id", name="uq_answer_report_owner_resource"),)


class PracticeDelivery(Base):
    __tablename__ = "practice_deliveries"
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("practice_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("generated_questions.id"), nullable=False)
    ordinal = Column(Integer, nullable=False)
    answered_at = Column(DateTime)
    __table_args__ = (UniqueConstraint("session_id", "ordinal", name="uq_practice_delivery_ordinal"),)


class BillingEvent(Base):
    __tablename__ = "billing_events"
    event_id = Column(String(120), primary_key=True)
    event_type = Column(String(80), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    provider_created = Column(Integer, nullable=False)
    amount_minor = Column(Integer, nullable=False, default=0)
    currency = Column(String(12))
    processed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
