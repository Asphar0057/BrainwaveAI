import logging
import os

from database import Base, engine, SessionLocal

from models.question_bank import create_question_bank_models
from models.learning_paths import create_learning_paths_models

from models.user import (
    DailyGoal,
    User,
    UserStats,
    UserPreferences,
    UserPersonalityProfile,
    LearningPattern,
    EnhancedUserStats,
    DailyLearningMetrics,
    StudentStyleModel,
    PasswordResetOTP,
    RegistrationOTP,
    AccountDeletionOTP,
    ComprehensiveUserProfile,
)

from models.chat import (
    ChatSession,
    ChatMessage,
    ChatTutorState,
    ChatFolder,
    ConversationMemory,
    AILearningMetrics,
)

from models.ai_jobs import AIJob

from models.content import (
    MediaFile,
    Folder,
    Note,
    NoteFolder,
    UploadedSlide,
    SlideAnalysis,
    NoteBlock,
    NoteProperty,
    NoteTemplate,
    NoteLink,
    NoteComment,
    NoteVersion,
    NoteCollaborator,
    NoteDatabase,
    DatabaseEntry,
    NoteEmbed,
    NoteAttachment,
    NoteMention,
    NoteActivity,
    Activity,
)

from models.flashcards import (
    FlashcardSet,
    Flashcard,
    FlashcardStudySession,
)

from models.social import (
    Friendship,
    FriendRequest,
    FriendActivity,
    Kudos,
    Leaderboard,
    QuizBattle,
    Challenge,
    ChallengeParticipation,
    BattleQuestion,
    ChallengeQuestion,
    BattleAnswer,
    ChallengeAnswer,
    SharedContent,
    SharedContentAccess,
    SoloQuiz,
    SoloQuizQuestion,
)

from models.gamification import (
    Achievement,
    UserAchievement,
    UserGamificationStats,
    PointTransaction,
    WeeklyBingoProgress,
)

from models.learning import (
    TopicMastery,
    KnowledgeNode,
    KnowledgeRoadmap,
    NodeExplorationHistory,
    LearningReview,
    LearningReviewAttempt,
    LearningReviewHint,
    LearningReviewStats,
    LearningReviewSlide,
    TopicKnowledgeBase,
    GlobalKnowledgeBase,
    AIResponseImprovement,
    CommonMisconceptions,
    UserFeedback,
    ConceptNode,
    ConceptConnection,
    LearningPlaylist,
    PlaylistItem,
    PlaylistFollower,
    PlaylistFork,
    PlaylistCollaborator,
    PlaylistComment,
    StudyPlan,
    PracticeSession,
    PracticeAnswer,
)

from models.notifications import (
    Notification,
    ReminderList,
    Reminder,
)

from models.questions import (
    GeneratedQuestion,
    QuestionAttempt,
    QuestionResult,
    QuestionSetSlide,
    UserWeakArea,
    WrongAnswerLog,
    PracticeRecommendation,
    ChatConceptSignal,
)

from models.context import (
    ContextFolder,
    ContextDocument,
)

from models.ml import (
    StudentKnowledgeState,
    StudentMemory,
    MessageMLLog,
    CerbylSessionState,
    AgentEvent,
    BanditState,
    BanditRewardQueue,
    BanditEpisodeLog,
    DKTArtifact,
)

from models.imports import (
    ImportExportHistory,
    ExportedFile,
    BatchOperation,
    ExternalImport,
)

from models.podcast import (
    PodcastSessionMemory,
    PodcastBookmark,
)

from models.institution import (
    AcademicTerm,
    Announcement,
    Assignment,
    AttendanceRecord,
    ClassActivityEvent,
    ClassSection,
    ClassroomMessage,
    Course,
    CourseMaterial,
    Enrollment,
    Organization,
    OrganizationMembership,
    Submission,
)

from models.schemas import (
    LearningReviewCreate,
    LearningReviewResponse,
    ReviewHintRequest,
    LearningReviewSummary,
    ComprehensiveProfileUpdate,
)

logger = logging.getLogger(__name__)

UploadedDocument, QuestionSet, Question, QuestionSession, UserPerformanceMetrics = create_question_bank_models(Base)
LearningPath, LearningPathNode, LearningPathProgress, LearningNodeProgress, LearningNodeNote = create_learning_paths_models(Base)


def create_tables():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    create_tables()
    logger.info(" Database tables created successfully!")
