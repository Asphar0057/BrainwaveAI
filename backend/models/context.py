from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


class ContextFolder(Base):
    __tablename__ = "context_folders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(50), default="#D7B38C")
    parent_id = Column(Integer, ForeignKey("context_folders.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="context_folders")
    documents = relationship("ContextDocument", back_populates="folder")


class ContextDocument(Base):
    __tablename__ = "context_documents"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    folder_id    = Column(Integer, ForeignKey("context_folders.id"), nullable=True)
    doc_id       = Column(String(36), unique=True, index=True, nullable=False)
    filename     = Column(String(255), nullable=False)
    file_type    = Column(String(10), nullable=False, default="pdf")
    subject      = Column(String(100), nullable=True)
    grade_level  = Column(String(20), nullable=True)
    scope        = Column(String(20), nullable=False, default="private")
    chunk_count  = Column(Integer, default=0)
    status       = Column(String(20), default="processing")
    source_url   = Column(String(500), nullable=True)
    source_name  = Column(String(200), nullable=True)
    license      = Column(String(80), nullable=True)
    curriculum   = Column(String(20), nullable=True)
    source_type  = Column(String(40), nullable=True)
    storage_path = Column(String(500), nullable=True)
    storage_type = Column(String(30), nullable=True)
    storage_url  = Column(String(1000), nullable=True)
    ai_summary   = Column(Text, nullable=True)
    key_concepts = Column(Text, nullable=True)
    topic_tags   = Column(Text, nullable=True)
    in_deck      = Column(Boolean, nullable=False, default=False, server_default="false")
    deck_added_at = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", backref="context_documents")
    folder = relationship("ContextFolder", back_populates="documents")
