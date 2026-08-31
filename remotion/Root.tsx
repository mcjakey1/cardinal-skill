import React from 'react';
import {Composition} from 'remotion';
import {CardinalPitch} from './CardinalPitch';
import {ReferenceFilm} from './ReferenceFilm';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CardinalPitch"
        component={CardinalPitch}
        durationInFrames={1440}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ReferenceFilm"
        component={ReferenceFilm}
        durationInFrames={5665}
        fps={60}
        width={1280}
        height={720}
      />
    </>
  );
};
