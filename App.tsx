import { StatusBar } from 'expo-status-bar';
import { FiberCanvas } from './src/features/fiberCanvas';

export default function App() {
	return (
		<>
			<FiberCanvas />
			<StatusBar translucent />
		</>
	);
}
