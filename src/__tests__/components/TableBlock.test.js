jest.mock('katex/contrib/auto-render', () => require('katex/dist/contrib/auto-render.js'), { virtual: true });
import { render, screen } from '@testing-library/react';
import TableBlock from '../../components/TableBlock';

test('reading a table renders formulas and inline code instead of editable source', () => {
  const { container } = render(<TableBlock readOnly data={{ rows: [['Quantity', 'Formula'], ['Mean', '$\\mu=3.5$ and `<div>`']] }} />);
  expect(container.querySelectorAll('textarea')).toHaveLength(0);
  expect(container.querySelector('.katex')).toBeTruthy();
  expect(container.querySelector('code').textContent).toBe('<div>');
});

test('editing keeps literal cell source intact', () => {
  render(<TableBlock data={{ rows: [['Quantity', 'Formula'], ['Mean', '$\\mu=3.5$']] }} />);
  expect(screen.getByDisplayValue('$\\mu=3.5$')).toHaveAttribute('rows', '1');
});
