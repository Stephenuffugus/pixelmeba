import { route } from '../state';
import { toast } from '../state';
import { Home } from '../views/Home';
import { Play } from '../views/Play';
import { DishScreen } from '../views/DishScreen';
import { SimplePage } from '../views/SimplePage';
import { Saves } from '../views/Saves';
import { NewDish } from '../views/NewDish';
import { CompareScreen } from '../views/CompareScreen';
import { Notebook } from '../views/Notebook';
import { ExperimentCard } from '../views/ExperimentCard';
import { ExperimentRun } from '../views/ExperimentRun';

/** Screens that show toasts themselves (over the dish or the paired run). */
const OWN_TOAST_ROUTES: readonly string[] = ['dish', 'compare', 'experimentRun'];

/**
 * A toast raised while a page without its own toast host is showing (e.g. an import from Saved dishes
 * that was refused, or a save that could not be opened): shown here so the message reaches the player.
 */
function PageToast() {
  if (!toast.value || OWN_TOAST_ROUTES.includes(route.value.name)) return null;
  return (
    <div class="toast page-toast" role="status" aria-live="polite" data-testid="page-toast">
      {toast.value}
    </div>
  );
}

export function App() {
  return (
    <>
      <RoutedPage />
      <PageToast />
    </>
  );
}

function RoutedPage() {
  const r = route.value;
  switch (r.name) {
    case 'home':
      return <Home />;
    case 'play':
      return <Play />;
    case 'dish':
      return <DishScreen />;
    case 'guide':
      return <SimplePage title="Field Guide" body="Every organism, material and tool will be listed here." />;
    case 'settings':
      return <SimplePage title="Settings" body="Sound, motion, text size and overlay options." settings />;
    case 'saves':
      return <Saves />;
    case 'newDish':
      return <NewDish />;
    case 'compare':
      return <CompareScreen />;
    case 'notebook':
      return <Notebook />;
    case 'experiment':
      return <ExperimentCard />;
    case 'experimentRun':
      return <ExperimentRun />;
    case 'about':
      return (
        <SimplePage
          title="About Pixelmeba"
          body="Pixelmeba is a playful pixel ecosystem sandbox. Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement. Your dishes are saved only on this device. Nothing is uploaded."
        />
      );
  }
}
