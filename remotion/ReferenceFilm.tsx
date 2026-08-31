import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile} from 'remotion';

export const ReferenceFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <OffthreadVideo
        src={staticFile('cardinal-pitch/perplexity_computer.mp4')}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </AbsoluteFill>
  );
};
