import { route } from '../state';
import { Home } from '../views/Home';
import { Play } from '../views/Play';
import { DishScreen } from '../views/DishScreen';
import { SimplePage } from '../views/SimplePage';
import { Saves } from '../views/Saves';
import { NewDish } from '../views/NewDish';
import { CompareScreen } from '../views/CompareScreen';

export function App() {
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
    case 'about':
      return (
        <SimplePage
          title="About Pixelmeba"
          body="Pixelmeba is a playful pixel ecosystem sandbox. Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement. Your dishes are saved only on this device. Nothing is uploaded."
        />
      );
  }
}
