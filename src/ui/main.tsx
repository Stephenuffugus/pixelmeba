import { render } from 'preact';

function Boot() {
  return (
    <main>
      <h1>Pixelmeba</h1>
      <p>Grow a tiny living world. Change one thing. See what happens.</p>
    </main>
  );
}

const root = document.getElementById('app');
if (root) render(<Boot />, root);
