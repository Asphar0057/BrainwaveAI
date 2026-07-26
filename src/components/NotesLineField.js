import GeometricGrid from './GeometricGrid';
import './NotesLineField.css';

export default function NotesLineField({ quiet = false }) {
  return (
    <div className={`notes-line-field ${quiet ? 'notes-line-field--quiet' : ''}`} aria-hidden="true">
      <GeometricGrid
        className="notes-line-field__grid"
        linesClassName="notes-line-field__lines"
        numsClassName="notes-line-field__numbers"
      />
      <div className="notes-line-field__wash" />
    </div>
  );
}
