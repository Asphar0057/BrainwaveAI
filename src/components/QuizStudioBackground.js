import GeometricGrid from './GeometricGrid';
import './QuizStudioBackground.css';

const QuizStudioBackground = () => (
  <div className="quiz-studio-atmosphere" aria-hidden="true">
    <div className="quiz-studio-wash" />
    <GeometricGrid
      className="quiz-studio-grid"
      linesClassName="quiz-studio-grid-lines"
      numsClassName="quiz-studio-grid-numbers"
    />
    <div className="quiz-studio-vignette" />
  </div>
);

export default QuizStudioBackground;
