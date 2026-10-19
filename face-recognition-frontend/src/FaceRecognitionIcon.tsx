import type { SVGProps } from 'react';

const FaceRecognitionIcon = (props: SVGProps<SVGSVGElement>) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
    >
        <path d="M8 3H6a3 3 0 0 0-3 3v2" />
        <path d="M16 3h2a3 3 0 0 1 3 3v2" />
        <path d="M8 21H6a3 3 0 0 1-3-3v-2" />
        <path d="M16 21h2a3 3 0 0 0 3-3v-2" />
        <path d="M8.5 9h.01" />
        <path d="M15.5 9h.01" />
        <path d="M12 9.25v3.25l-1 1h2" />
        <path d="M8.75 16c1.8 1.5 4.7 1.5 6.5 0" />
    </svg>
);

export default FaceRecognitionIcon;
