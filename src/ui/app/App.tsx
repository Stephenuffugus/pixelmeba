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
import { FieldGuide } from '../views/FieldGuide';
import { RelationshipSync } from '../views/FieldGuideNav';
import { LiveRegion } from '../a11y/LiveRegion';

/** Screens that show toasts themselves (over the dish or the paired run). */
const OWN_TOAST_ROUTES: readonly string[] = ['dish', 'compare', 'experimentRun'];

/**
 * A toast raised while a page without its own toast host is showing (e.g. an import from Saved dishes
 * that was refused, or a save that could not be opened): shown here so the message reaches the player.
 */
function PageToast() {
  if (!toast.value || OWN_TOAST_ROUTES.includes(route.value.name)) return null;
  return (
    // Announced by the always-mounted LiveRegion (P3.11 W6-07); this toast is visual only.
    <div class="toast page-toast" data-testid="page-toast">
      {toast.value}
    </div>
  );
}

export function App() {
  return (
    <>
      <RoutedPage />
      <PageToast />
      {/* P3.11 (UX §9, W6-07): the one polite live region; it reads out every one-line result (the toast). */}
      <LiveRegion />
      {/* P3.8 (D-0039): what the open dish has shown joins the device's "seen in your dishes" record. */}
      <RelationshipSync />
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
      return <FieldGuide />;
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
          about
        />
      );
  }
}
