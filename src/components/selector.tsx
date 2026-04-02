import { Button, Image, Text, View, Animated, TouchableOpacity, StyleSheet, Easing, Platform } from 'react-native';
import { useModelStore } from '../store/useModelStore';
import { useEffect, useRef, useState } from 'react';
import { FontAwesome6, Ionicons } from '@expo/vector-icons';

export const ModelSelector = () => {
	const { modelName, thumbnail, isLoading, loadProgress, changeModel } = useModelStore();

	// Animation for progress bar
	const progressAnim = useRef(new Animated.Value(0)).current;
	const pulseAnim = useRef(new Animated.Value(1)).current;
	const [isExpanded, setIsExpanded] = useState(false);
	const expandAnim = useRef(new Animated.Value(0)).current;

	// Animate progress bar in real-time
	useEffect(() => {
		Animated.timing(progressAnim, {
			toValue: loadProgress / 100,
			duration: 200,
			useNativeDriver: false,
		}).start();
	}, [loadProgress, progressAnim]);

	// Pulse animation for loading state
	useEffect(() => {
		if (isLoading) {
			const pulse = Animated.loop(
				Animated.sequence([
					Animated.timing(pulseAnim, {
						toValue: 0.8,
						duration: 800,
						useNativeDriver: true,
					}),
					Animated.timing(pulseAnim, {
						toValue: 1,
						duration: 800,
						useNativeDriver: true,
					}),
				])
			);
			pulse.start();
			return () => pulse.stop();
		} else {
			pulseAnim.setValue(1);
		}
	}, [isLoading, pulseAnim]);

	const getProgressColor = () => {
		if (loadProgress < 30) return '#ff6b6b';
		if (loadProgress < 70) return '#ffd93d';
		return '#6bcf7f';
	};
 
	const toggleExpanded = () => {
		const toValue = isExpanded ? 0 : 1;
		Animated.timing(expandAnim, {
			toValue,
			duration: 350,
			easing: Easing.bezier(0.25, 1, 0.5, 1),
			useNativeDriver: true,
		}).start();
		setIsExpanded(!isExpanded);
	};
 
	const rotateIcon = expandAnim.interpolate({
		inputRange: [0, 1],
		outputRange: ['0deg', '90deg'],
	});
 
	const translateY = expandAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [20, 0],
	});
 
	const opacity = expandAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [0, 1],
	});
 
	const scale = expandAnim.interpolate({
		inputRange: [0, 1],
		outputRange: [0.9, 1],
	});

	return (
		<View style={styles.container}>
			<TouchableOpacity
				onPress={toggleExpanded}
				style={styles.fab}
				activeOpacity={0.8}
			>
				<Animated.View style={{ transform: [{ rotate: rotateIcon }] }}>
					{isExpanded 
						? <Ionicons name='close' size={24} color="#fff"/> 
						: <FontAwesome6 name="person" size={24} color="#fff" /> 
					}
				</Animated.View>
			</TouchableOpacity>
 
			<Animated.View
				style={[
					styles.card,
					{
						opacity,
						transform: [{ translateY }, { scale }],
					},
				]}
				pointerEvents={isExpanded ? 'auto' : 'none'}
			>
				<Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 8 }}>
					<Text style={styles.cardHeader}>
						Model Select
					</Text>
				</Animated.View>
 
				{thumbnail && (
					<View style={styles.thumbnailContainer}>
						<Image
							source={{ uri: thumbnail }}
							style={styles.thumbnail}
							resizeMode="cover"
						/>
					</View>
				)}
 
				<View style={{ gap: 6 }}>
					<View style={{
						backgroundColor: modelName === 'cheongsam' ? '#4299e1' : '#f1f5f9',
						borderRadius: 10,
						overflow: 'hidden',
					}}>
						<Button
							title="Cheongsam"
							onPress={() => changeModel('cheongsam')}
							disabled={modelName === 'cheongsam'}
							color={modelName === 'cheongsam' ? '#ffffff' : '#4a5568'}
						/>
					</View>
 
					<View style={{
						backgroundColor: modelName === 'vrm0' ? '#4299e1' : '#f1f5f9',
						borderRadius: 10,
						overflow: 'hidden',
					}}>
						<Button
							title="Goblin Slayer"
							onPress={() => changeModel('vrm0')}
							disabled={modelName === 'vrm0'}
							color={modelName === 'vrm0' ? '#ffffff' : '#4a5568'}
						/>
					</View>
 
					<View style={{
						backgroundColor: modelName === 'vrm1' ? '#4299e1' : '#f1f5f9',
						borderRadius: 10,
						overflow: 'hidden',
					}}>
						<Button
							title="Bella"
							onPress={() => changeModel('vrm1')}
							disabled={modelName === 'vrm1'}
							color={modelName === 'vrm1' ? '#ffffff' : '#4a5568'}
						/>
					</View>
 
					<View style={{
						backgroundColor: modelName === 'Sonya' ? '#4299e1' : '#f1f5f9',
						borderRadius: 10,
						overflow: 'hidden',
					}}>
						<Button
							title="Sonya"
							onPress={() => changeModel('Sonya')}
							disabled={modelName === 'Sonya'}
							color={modelName === 'Sonya' ? '#ffffff' : '#4a5568'}
						/>
					</View>
				</View>
 
				<View style={{ marginTop: 8 }}>
					{isLoading && (
						<View style={{ gap: 4 }}>
							<View style={styles.progressHeader}>
								<Text style={styles.statusText}>Loading...</Text>
								<Text style={[styles.progressText, { color: getProgressColor() }]}>
									{loadProgress}%
								</Text>
							</View>
 
							<View style={styles.progressBarBg}>
								<Animated.View style={[styles.progressBarFill, {
									backgroundColor: getProgressColor(),
									width: progressAnim.interpolate({
										inputRange: [0, 1],
										outputRange: ['0%', '100%'],
									}),
									shadowColor: getProgressColor(),
								}]} />
							</View>
						</View>
					)}
				</View>
			</Animated.View>
		</View>
	);
};
 
const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: Platform.OS === 'web' ? 10 : 55,
		left: 10,
		zIndex: 100,
	},
	fab: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: 'rgba(255,255,255,0.2)',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 8,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.08)',
	},
	card: {
		position: 'absolute',
		top: 50, 
		left: 0,
		width: 180,
		backgroundColor: 'rgba(255,255,255,1)',
		borderRadius: 20,
		padding: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 8 },
		shadowOpacity: 0.2,
		shadowRadius: 16,
		elevation: 10,
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.05)',
	},
	cardHeader: {
		fontSize: 15,
		fontWeight: '900',
		color: '#1a202c',
		letterSpacing: 0.5,
		textTransform: 'uppercase',
	},
	thumbnailContainer: {
		overflow: 'hidden',
		padding: 4,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 5,
	},
	thumbnail: {
		width: 64,
		height: 64,
		borderRadius: 8,
	},
	progressHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 4,
	},
	statusText: {
		fontSize: 11,
		color: '#718096',
		fontWeight: '600',
	},
	progressText: {
		fontSize: 11,
		fontWeight: '800',
	},
	progressBarBg: {
		height: 6,
		backgroundColor: '#e2e8f0',
		borderRadius: 3,
		overflow: 'hidden',
	},
	progressBarFill: {
		height: '100%',
		borderRadius: 3,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 3,
	}
});