import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Download, Upload } from 'lucide-react';
import './TableBlock.css';
import MathRenderer from './MathRenderer';
import { markdownToNoteHtml } from '../utils/noteContent';

const getDefaultRows = () => ([
  ['Header 1', 'Header 2', 'Header 3'],
  ['Cell 1', 'Cell 2', 'Cell 3'],
  ['Cell 4', 'Cell 5', 'Cell 6']
]);

const normalizeRows = (incomingRows) => {
  const rows = Array.isArray(incomingRows) && incomingRows.length
    ? incomingRows.map(row => Array.isArray(row) ? [...row] : [])
    : getDefaultRows();

  const columnCount = Math.max(2, rows[0]?.length || 0);
  const normalized = rows.map((row, index) => {
    const next = [...row];
    while (next.length < columnCount) next.push(index === 0 ? `Header ${next.length + 1}` : '');
    return next.slice(0, columnCount);
  });

  if (normalized.length < 2) {
    normalized.push(new Array(columnCount).fill(''));
  }

  return normalized;
};

const TableBlock = ({ data, onChange, readOnly = false }) => {
  const [rows, setRows] = useState(() => normalizeRows(data?.rows));
  const [selectedCell, setSelectedCell] = useState(null);
  const [showColumnMenu, setShowColumnMenu] = useState(null);
  const [draggedRowIndex, setDraggedRowIndex] = useState(null);
  const [draggedColIndex, setDraggedColIndex] = useState(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState(null);
  const [dragOverColIndex, setDragOverColIndex] = useState(null);
  const tableRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastDataRef = useRef('');

  useEffect(() => {
    const serialized = JSON.stringify(data?.rows || []);
    if (serialized !== lastDataRef.current) {
      lastDataRef.current = serialized;
      setRows(normalizeRows(data?.rows));
      setSelectedCell(null);
      setShowColumnMenu(null);
    }
  }, [data?.rows]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!tableRef.current) return;
      if (event.target.closest('.column-menu') || event.target.closest('.column-menu-btn')) return;
      setShowColumnMenu(null);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setShowColumnMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const updateCell = (rowIndex, colIndex, value) => {
    const newRows = [...rows];
    newRows[rowIndex][colIndex] = value;
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const addRow = (index) => {
    const newRows = [...rows];
    const newRow = new Array(rows[0].length).fill('');
    newRows.splice(index + 1, 0, newRow);
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const deleteRow = (index) => {
    if (rows.length <= 2) return; 
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const addColumn = (index) => {
    const newRows = rows.map(row => {
      const newRow = [...row];
      newRow.splice(index + 1, 0, '');
      return newRow;
    });
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const addColumnLeft = (index) => {
    const newRows = rows.map((row, rowIndex) => {
      const newRow = [...row];
      newRow.splice(index, 0, rowIndex === 0 ? `Header ${index + 1}` : '');
      return newRow;
    });
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const deleteColumn = (index) => {
    if (rows[0].length <= 2) return; 
    const newRows = rows.map(row => row.filter((_, i) => i !== index));
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const moveRow = (index, direction) => {
    if (index === 0) return; 
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 1 || newIndex >= rows.length) return;
    
    const newRows = [...rows];
    [newRows[index], newRows[newIndex]] = [newRows[newIndex], newRows[index]];
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const moveRowTo = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 1 || toIndex < 1) return;
    let adjustedTo = toIndex;
    if (fromIndex < toIndex) {
      adjustedTo -= 1;
    }
    const clampedTo = Math.min(Math.max(adjustedTo, 1), rows.length - 1);
    if (clampedTo === fromIndex) return;
    const newRows = [...rows];
    const [moved] = newRows.splice(fromIndex, 1);
    newRows.splice(clampedTo, 0, moved);
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const moveColumnTo = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    const maxIndex = rows[0].length - 1;
    let adjustedTo = toIndex;
    if (fromIndex < toIndex) {
      adjustedTo -= 1;
    }
    const clampedTo = Math.min(Math.max(adjustedTo, 0), maxIndex);
    if (clampedTo === fromIndex) return;
    const newRows = rows.map((row) => {
      const next = [...row];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(clampedTo, 0, moved);
      return next;
    });
    setRows(newRows);
    onChange?.({ rows: newRows });
  };

  const focusCell = (rowIndex, colIndex) => {
    const selector = `[data-row="${rowIndex}"][data-col="${colIndex}"]`;
    const target = tableRef.current?.querySelector(selector);
    if (target) target.focus();
  };

  const handleCellKeyDown = (event, rowIndex, colIndex) => {
    if (readOnly) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow >= rows.length) {
        const newRows = [...rows, new Array(rows[0].length).fill('')];
        setRows(newRows);
        onChange?.({ rows: newRows });
        requestAnimationFrame(() => focusCell(nextRow, colIndex));
        return;
      }
      focusCell(nextRow, colIndex);
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const direction = event.shiftKey ? -1 : 1;
      let nextCol = colIndex + direction;
      let nextRow = rowIndex;
      if (nextCol < 0) {
        nextCol = rows[0].length - 1;
        nextRow = Math.max(1, rowIndex - 1);
      } else if (nextCol >= rows[0].length) {
        nextCol = 0;
        nextRow = rowIndex + 1;
        if (nextRow >= rows.length) {
          const newRows = [...rows, new Array(rows[0].length).fill('')];
          setRows(newRows);
          onChange?.({ rows: newRows });
        }
      }
      requestAnimationFrame(() => focusCell(nextRow, nextCol));
    }
  };

  const handleRowDragStart = (rowIndex) => {
    if (readOnly) return;
    setDraggedRowIndex(rowIndex);
    setDragOverRowIndex(null);
  };

  const handleRowDragOver = (event, rowIndex) => {
    if (readOnly || draggedRowIndex === null) return;
    event.preventDefault();
    setDragOverRowIndex(rowIndex);
  };

  const handleRowDrop = (event, rowIndex) => {
    if (readOnly || draggedRowIndex === null) return;
    event.preventDefault();
    moveRowTo(draggedRowIndex, rowIndex);
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const handleRowDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const handleColumnDragStart = (colIndex) => {
    if (readOnly) return;
    setDraggedColIndex(colIndex);
    setDragOverColIndex(null);
  };

  const handleColumnDragOver = (event, colIndex) => {
    if (readOnly || draggedColIndex === null) return;
    event.preventDefault();
    setDragOverColIndex(colIndex);
  };

  const handleColumnDrop = (event, colIndex) => {
    if (readOnly || draggedColIndex === null) return;
    event.preventDefault();
    moveColumnTo(draggedColIndex, colIndex);
    setDraggedColIndex(null);
    setDragOverColIndex(null);
  };

  const handleColumnDragEnd = () => {
    setDraggedColIndex(null);
    setDragOverColIndex(null);
  };

  const toCsv = (tableRows) => tableRows.map((row) => row.map((cell) => {
    const value = `${cell ?? ''}`;
    if (/[",\n]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(',')).join('\n');

  const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cell += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(cell);
        cell = '';
      } else if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (char !== '\r') {
        cell += char;
      }
    }
    row.push(cell);
    if (row.length > 1 || row[0] !== '') {
      rows.push(row);
    }
    return normalizeRows(rows);
  };

  const handleExportCsv = () => {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'table.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportCsv = (event) => {
    if (readOnly) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result || '';
      const parsed = parseCsv(String(text));
      setRows(parsed);
      onChange?.({ rows: parsed });
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  useEffect(() => {
    const resize = () => tableRef.current?.querySelectorAll('textarea').forEach(cell => {
      cell.style.height = 'auto';
      cell.style.height = `${cell.scrollHeight}px`;
    });
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    if (tableRef.current) observer?.observe(tableRef.current);
    return () => observer?.disconnect();
  }, [rows, readOnly]);

  return (
    <div className={`table-block ${readOnly ? 'read-only' : ''}`}>
      <div className="table-wrapper" ref={tableRef}>
        <table className="note-table">
          <thead>
            <tr>
              <th className="table-row-controls"></th>
              {rows[0]?.map((cell, colIndex) => (
                <th
                  key={colIndex}
                  className={`table-header-cell ${dragOverColIndex === colIndex ? 'col-drop-target' : ''}`}
                  onDragOver={(event) => handleColumnDragOver(event, colIndex)}
                  onDrop={(event) => handleColumnDrop(event, colIndex)}
                >
                  <div className="table-cell-content">
                    {readOnly ? <MathRenderer className="table-cell-rendered" content={markdownToNoteHtml(cell)} /> : <textarea
                      rows={1}
                      value={cell}
                      onChange={(e) => updateCell(0, colIndex, e.target.value)}
                      placeholder={`Column ${colIndex + 1}`}
                      className="table-cell-input header-input"
                      readOnly={readOnly}
                      data-row={0}
                      data-col={colIndex}
                      onKeyDown={(event) => handleCellKeyDown(event, 0, colIndex)}
                    />}
                    <button
                      className="column-drag-handle"
                      title="Drag column"
                      draggable={!readOnly}
                      onDragStart={() => handleColumnDragStart(colIndex)}
                      onDragEnd={handleColumnDragEnd}
                      disabled={readOnly}
                    >
                      <GripVertical size={12} />
                    </button>
                    <button
                      className="column-menu-btn"
                      onClick={() => setShowColumnMenu(showColumnMenu === colIndex ? null : colIndex)}
                      disabled={readOnly}
                    >
                      <ChevronDown size={14} />
                    </button>
                    {showColumnMenu === colIndex && (
                      <div className="column-menu">
                        <button onClick={() => { addColumnLeft(colIndex); setShowColumnMenu(null); }}>
                          <Plus size={14} /> Insert Left
                        </button>
                        <button onClick={() => { addColumn(colIndex); setShowColumnMenu(null); }}>
                          <Plus size={14} /> Insert Right
                        </button>
                        <button 
                          onClick={() => { deleteColumn(colIndex); setShowColumnMenu(null); }}
                          disabled={rows[0].length <= 2}
                        >
                          <Trash2 size={14} /> Delete Column
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((row, rowIndex) => (
              <tr
                key={rowIndex + 1}
                className={dragOverRowIndex === rowIndex + 1 ? 'row-drop-target' : ''}
                onDragOver={(event) => handleRowDragOver(event, rowIndex + 1)}
                onDrop={(event) => handleRowDrop(event, rowIndex + 1)}
              >
                <td className="table-row-controls">
                  <div className="row-controls-group">
                    <button
                      className="row-control-btn drag-handle"
                      title="Drag row"
                      draggable={!readOnly}
                      onDragStart={() => handleRowDragStart(rowIndex + 1)}
                      onDragEnd={handleRowDragEnd}
                      disabled={readOnly}
                    >
                      <GripVertical size={14} />
                    </button>
                    <button
                      className="row-control-btn"
                      onClick={() => moveRow(rowIndex + 1, 'up')}
                      title="Move up"
                      disabled={readOnly}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      className="row-control-btn"
                      onClick={() => moveRow(rowIndex + 1, 'down')}
                      title="Move down"
                      disabled={readOnly}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      className="row-control-btn"
                      onClick={() => addRow(rowIndex + 1)}
                      title="Add row below"
                      disabled={readOnly}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="row-control-btn delete"
                      onClick={() => deleteRow(rowIndex + 1)}
                      disabled={rows.length <= 2 || readOnly}
                      title="Delete row"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
                {row.map((cell, colIndex) => (
                  <td
                    key={colIndex}
                    className={selectedCell?.row === rowIndex + 1 && selectedCell?.col === colIndex ? 'selected' : ''}
                  >
                    {readOnly ? <MathRenderer className="table-cell-rendered" content={markdownToNoteHtml(cell)} /> : <textarea
                      rows={1}
                      value={cell}
                      onChange={(e) => updateCell(rowIndex + 1, colIndex, e.target.value)}
                      onFocus={() => setSelectedCell({ row: rowIndex + 1, col: colIndex })}
                      onBlur={() => setSelectedCell(null)}
                      placeholder="Enter text"
                      className="table-cell-input"
                      readOnly={readOnly}
                      data-row={rowIndex + 1}
                      data-col={colIndex}
                      onKeyDown={(event) => handleCellKeyDown(event, rowIndex + 1, colIndex)}
                    />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleImportCsv}
        />
        <button className="table-action-btn" onClick={() => fileInputRef.current?.click()} disabled={readOnly}>
          <Upload size={16} />
          Import CSV
        </button>
        <button className="table-action-btn" onClick={handleExportCsv}>
          <Download size={16} />
          Export CSV
        </button>
        <button className="table-action-btn" onClick={() => addRow(rows.length - 1)} disabled={readOnly}>
          <Plus size={16} />
          Add Row
        </button>
        <button className="table-action-btn" onClick={() => addColumn(rows[0].length - 1)} disabled={readOnly}>
          <Plus size={16} />
          Add Column
        </button>
      </div>
    </div>
  );
};

export default TableBlock;
