import React from 'react';
import LottieWeb from 'lottie-react';
import { StyleSheet } from 'react-native';

interface LottieViewProps {
	source: any;
	autoPlay?: boolean;
	loop?: boolean;
	style?: any;
}

const LottieView = ({ source, autoPlay, loop, style }: LottieViewProps) => {
	return (
		<LottieWeb
			animationData={source}
			autoPlay={autoPlay}
			loop={loop}
			style={StyleSheet.flatten(style)}
		/>
	);
};

export default LottieView;
