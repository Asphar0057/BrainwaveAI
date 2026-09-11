import { render, screen, fireEvent } from '@testing-library/react';
import useFileDrop from '../../hooks/useFileDrop';

function Target({ onFiles }) {
  const { dragActive, ...handlers } = useFileDrop(onFiles);
  return <main data-testid="drop" {...handlers}><span data-testid="child">Child</span>{dragActive && <p>Drop files to attach</p>}</main>;
}
const transfer = { types: ['Files'], files: [new File(['image'], 'screenshot.png', {type:'image/png'})] };

test('nested drag events keep the overlay visible until the file leaves the target', () => {
  render(<Target onFiles={jest.fn()} />);
  fireEvent.dragEnter(screen.getByTestId('drop'), { dataTransfer: transfer });
  fireEvent.dragEnter(screen.getByTestId('child'), { dataTransfer: transfer });
  fireEvent.dragLeave(screen.getByTestId('child'), { dataTransfer: transfer });
  expect(screen.getByText('Drop files to attach')).toBeInTheDocument();
  fireEvent.dragLeave(screen.getByTestId('drop'), { dataTransfer: transfer });
  expect(screen.queryByText('Drop files to attach')).not.toBeInTheDocument();
});

test('dropping a screenshot attaches it once and dismisses the overlay', () => {
  const onFiles = jest.fn();
  render(<Target onFiles={onFiles} />);
  fireEvent.dragEnter(screen.getByTestId('drop'), { dataTransfer: transfer });
  fireEvent.drop(screen.getByTestId('child'), { dataTransfer: transfer });
  expect(onFiles).toHaveBeenCalledTimes(1);
  expect(onFiles).toHaveBeenCalledWith(transfer.files);
  expect(screen.queryByText('Drop files to attach')).not.toBeInTheDocument();
});

test('chat/text drags do not activate file attachment and cancelled drags reset', () => {
  const onFiles = jest.fn();
  render(<Target onFiles={onFiles} />);
  fireEvent.dragEnter(screen.getByTestId('drop'), { dataTransfer: { types:['text/plain'] } });
  expect(screen.queryByText('Drop files to attach')).not.toBeInTheDocument();
  fireEvent.dragEnter(screen.getByTestId('drop'), { dataTransfer: transfer });
  fireEvent.dragEnd(window);
  expect(screen.queryByText('Drop files to attach')).not.toBeInTheDocument();
  expect(onFiles).not.toHaveBeenCalled();
});
