import React from 'react';
import LottieRN from 'lottie-react-native';

interface LottieViewProps {
	source: any;
	autoPlay?: boolean;
	loop?: boolean;
	style?: any;
}

const LottieView = ({ source, autoPlay, loop, style }: LottieViewProps) => {
	return <LottieRN source={source} autoPlay={autoPlay} loop={loop} style={style} />;
};

export default LottieView;
