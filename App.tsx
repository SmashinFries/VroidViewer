import { FiberCanvas } from './src/features/fiberCanvas';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, Image, StatusBar, StyleSheet } from 'react-native';
import LottieView from './src/components/LottieView';

SplashScreen.preventAutoHideAsync();

export default function App() {
	const [isReady, setIsReady] = useState(false);

	useEffect(() => {
		async function prepare() {
			try {			
				SplashScreen.hideAsync();
				await new Promise(resolve => setTimeout(resolve, 5500)); 
			} catch (e) {
				console.warn(e);
			} finally {
				setIsReady(true);
				await SplashScreen.hideAsync();
			}
		}

		prepare();
	}, []);

	// Show custom splash screen while not ready
	if (!isReady) {
		return (
			<View style={styles.splashContainer}>
				<Image
					source={require('./assets/splash-screen.png')}
					style={styles.splashImage}
					resizeMode="contain"
				/>
				<View style={styles.loadingContainer}>
					<LottieView
						source={require('./assets/lotties/progress-bar.json')}
						autoPlay
						loop={false}
						style={styles.lottieAnimation}
					/>
				</View>
				<StatusBar translucent barStyle="dark-content" />
			</View>
		);
	}

	return (
		<>
			<FiberCanvas onPreviewPress={() => {}}  />
			<StatusBar translucent />
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	splashContainer: {
		flex: 1,
		backgroundColor: '#FFFFFF',
		justifyContent: 'center',
		alignItems: 'center',
		objectFit: 'cover',
	},
	splashImage: {
		width: '80%',
		height: '80%',
		maxWidth: 450,
		maxHeight: 450,
	},
	loadingContainer: {
		justifyContent: 'center',
		alignItems: 'center',
	},
	lottieAnimation: {
		width: 125,
		height: 125,
	},
});

