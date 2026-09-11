import { useState, useRef } from 'react';
import { Copy, Check, Download } from 'lucide-react';
import './CodeBlock.css';

const LANGUAGES = [
  'javascript', 'python', 'java', 'cpp', 'c', 'csharp', 'php', 'ruby', 'go',
  'rust', 'swift', 'kotlin', 'typescript', 'html', 'css', 'sql', 'bash', 'shell',
  'json', 'xml', 'yaml', 'markdown', 'plaintext', 'mermaid', 'diagram', 'mindmap', 'graphjson', 'chartjson', 'datachart'
];

const CodeBlock = ({ code, language = 'javascript', onChange, readOnly = false }) => {
  const [copied, setCopied] = useState(false);
  const [selectedLang, setSelectedLang] = useState(language);
  const codeRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = selectedLang === 'python' ? 'py' : selectedLang === 'javascript' ? 'js' : 'txt';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLineNumbers = () => {
    const lines = code.split('\n');
    return lines.map((_, i) => i + 1).join('\n');
  };

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <select
          value={selectedLang}
          onChange={(e) => {
            setSelectedLang(e.target.value);
            if (onChange) onChange(code, e.target.value);
          }}
          className="code-lang-select"
          disabled={readOnly}
        >
          {LANGUAGES.map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        
        <div className="code-block-actions">
          <button
            onClick={handleDownload}
            className="code-action-btn"
            title="Download code"
          >
            <Download size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="code-action-btn"
            title="Copy code"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="code-block-content">
        <div className="code-line-numbers">
          {getLineNumbers()}
        </div>
        <textarea
          rows={Math.min(24, Math.max(3, code.split("\n").length))}
          ref={codeRef}
          className={`code-block-textarea language-${selectedLang}`}
          value={code}
          onChange={(e) => {
            if (onChange) onChange(e.target.value, selectedLang);
          }}
          readOnly={readOnly}
          spellCheck={false}
          placeholder="Enter your code here..."
        />
      </div>

    </div>
  );
};

export default CodeBlock;
