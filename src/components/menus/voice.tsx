import React, { useState } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	ScrollView,
	Platform,
	Dimensions,
} from 'react-native';
import Modal from 'react-native-modal';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AUDIOS = [
	{ 
		id: '1', 
		name: "action.mp3", 
		title: "Power of Action", 
		icon: 'music-clef-treble',
		asset: require('../../../assets/audios/action.mp3')
	},
	{ 
		id: '2', 
		name: "greeting.mp3", 
		title: "Daily Greeting", 
		icon: 'music-clef-treble',
		asset: require('../../../assets/audios/greeting.mp3')
	},
	{ 
		id: '3', 
		name: "bravery.mp3", 
		title: "Quiet Strength", 
		icon: 'music-clef-treble',
		asset: require('../../../assets/audios/bravery.mp3')
	},
	{ 
		id: '4', 
		name: "selflove.mp3", 
		title: "Self Appreciation", 
		icon: 'music-clef-treble',
		asset: require('../../../assets/audios/selflove.mp3')
	},
];

interface VoiceViewProps {
	onPlayVoice: (assetName: string) => void;
}

export const VoiceView: React.FC<VoiceViewProps> = ({ onPlayVoice }) => {
	const [isVisible, setIsVisible] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);

	const handleSelect = async (item: typeof AUDIOS[0]) => {
		try {
			setIsProcessing(true);
			const asset = Asset.fromModule(item.asset);
			if (!asset.localUri) {
				await asset.downloadAsync();
			}
			
			const uri = asset.localUri || asset.uri;
			console.log(`[VoiceView] Resolved audio URI: ${uri}`);
			
			onPlayVoice(uri);
			setIsVisible(false);
		} catch (error) {
			console.error('[VoiceView] Failed to resolve audio asset:', error);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<>
			<View style={styles.shadowWrapper}>
				<TouchableOpacity
					onPress={() => setIsVisible(true)}
					style={styles.iconContainer}
					activeOpacity={0.7}
				>
					<MaterialCommunityIcons name="microphone-variant" size={24} color="#2d3748" />
				</TouchableOpacity>
			</View>

			<Modal
				isVisible={isVisible}
				onBackdropPress={() => setIsVisible(false)}
				onSwipeComplete={() => setIsVisible(false)}
				swipeDirection="down"
				style={styles.modal}
				backdropOpacity={0.4}
				deviceHeight={SCREEN_HEIGHT}
			>
				<View style={styles.bottomSheet}>
					<View style={styles.handle} />
					
					<View style={styles.header}>
						<Text style={styles.title}>Voice Lines</Text>
						<Text style={styles.subtitle}>Select a line to play with real-time lip-sync</Text>
					</View>

					<ScrollView 
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}
					>
						{AUDIOS.map((item) => (
							<TouchableOpacity
								key={item.id}
								style={styles.voiceItem}
								onPress={() => handleSelect(item)}
								activeOpacity={0.6}
								disabled={isProcessing}
							>
								<View style={styles.voiceIconContainer}>
									<MaterialCommunityIcons 
										name={item.icon as any} 
										size={24} 
										color="#4299e1" 
									/>
								</View>
								<View style={styles.voiceTextContainer}>
									<Text style={styles.voiceTitle}>{item.title}</Text>
									<Text style={styles.voiceFileName}>{item.name}</Text>
								</View>
								<Ionicons name="play-circle" size={28} color="#4299e1" />
							</TouchableOpacity>
						))}
					</ScrollView>
				</View>
			</Modal>
		</>
	);
};

const styles = StyleSheet.create({
	shadowWrapper: {
		borderRadius: 16,
		...(Platform.OS === 'ios'
			? {
					shadowColor: '#000',
					shadowOffset: { width: 0, height: 2 },
					shadowOpacity: 0.15,
					shadowRadius: 6,
				}
			: {
					elevation: 4,
				}),
	},
	iconContainer: {
		backgroundColor: 'rgba(255,255,255,0.9)',
		borderRadius: 16,
		width: 44,
		height: 44,
		justifyContent: 'center',
		alignItems: 'center',
		borderWidth: 1,
		borderColor: 'rgba(0,0,0,0.05)',
	},
	modal: {
		margin: 0,
		justifyContent: 'flex-end',
	},
	bottomSheet: {
		backgroundColor: '#FFFFFF',
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingTop: 12,
		paddingHorizontal: 20,
		paddingBottom: Platform.OS === 'ios' ? 40 : 24,
		maxHeight: SCREEN_HEIGHT * 0.6,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: -4 },
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 20,
	},
	handle: {
		width: 40,
		height: 5,
		backgroundColor: '#e2e8f0',
		borderRadius: 3,
		alignSelf: 'center',
		marginBottom: 20,
	},
	header: {
		marginBottom: 20,
	},
	title: {
		fontSize: 22,
		fontWeight: '800',
		color: '#1a202c',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 14,
		color: '#718096',
		fontWeight: '500',
	},
	scrollContent: {
		paddingBottom: 10,
	},
	voiceItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#f7fafc',
		borderRadius: 16,
		padding: 14,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: '#edf2f7',
	},
	voiceIconContainer: {
		width: 44,
		height: 44,
		borderRadius: 12,
		backgroundColor: '#ebf8ff',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 14,
	},
	voiceTextContainer: {
		flex: 1,
	},
	voiceTitle: {
		fontSize: 16,
		fontWeight: '700',
		color: '#2d3748',
		marginBottom: 2,
	},
	voiceFileName: {
		fontSize: 12,
		color: '#a0aec0',
		fontWeight: '600',
	},
});
