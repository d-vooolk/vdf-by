/**
 * Иконки инлайном вместо библиотеки: нужно их полтора десятка, а любой
 * icon-пакет — это лишняя зависимость и лишние килобайты в бандле.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.55L21 8H6" />
    <circle cx="10" cy="20" r="1.4" />
    <circle cx="18" cy="20" r="1.4" />
  </Icon>
);

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 9 7 7 7-7" />
  </Icon>
);

export const PhoneIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 4h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5L14 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 2.5 6.2 2 2 0 0 1 4.5 4Z" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 13 4 4L19 7" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9L18 7" />
  </Icon>
);

export const CopyIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MinusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
);

export const TruckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 6h11v11H2zM13 10h4.5l3.5 3.5V17h-8" />
    <circle cx="6.5" cy="19" r="1.6" />
    <circle cx="17" cy="19" r="1.6" />
  </Icon>
);

export const ShieldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.8-7 9-4.1-1.2-7-4.8-7-9V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const HeadlightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h4a6 6 0 0 1 0 12h-4A2.5 2.5 0 0 1 3 15.5v-7Z" />
    <path d="M14.5 9h6M13.8 12h7.2M14.5 15h6" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </Icon>
);

export const SpinnerIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="2.5"
      opacity="0.25"
    />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const UploadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 15V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const DownloadIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const ImagePlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
    <path d="m4 16 4.5-4.5a1.5 1.5 0 0 1 2.1 0L16 17" />
    <path d="m14 15 1.5-1.5a1.5 1.5 0 0 1 2.1 0L20 16" />
    <path d="M18 3v6M15 6h6" />
  </Icon>
);

export const UndoIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    <path d="m8 5-4 4 4 4" />
  </Icon>
);

export const BlurIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5c3 3.6 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6.4 5.5-10Z" />
    <path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
  </Icon>
);

export const EraserIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m7 21-4.3-4.3a1.5 1.5 0 0 1 0-2.1L13.4 3.9a1.5 1.5 0 0 1 2.1 0l4.6 4.6a1.5 1.5 0 0 1 0 2.1L10.5 20.2" />
    <path d="M7 21h14" />
    <path d="m8.5 9.5 6 6" />
  </Icon>
);

export const CropIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </Icon>
);

export const FlipIcon =(props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3v18" strokeDasharray="2 2.5" />
    <path d="M9 7 4 17h5V7Z" />
    <path d="M15 7l5 10h-5V7Z" />
  </Icon>
);

export const SlopeUpIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 17 21 7" strokeWidth="2.5" />
  </Icon>
);

export const SlopeDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 7l18 10" strokeWidth="2.5" />
  </Icon>
);

export const PackageIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
    <path d="m3 8 9 5 9-5" />
    <path d="M12 13v8" />
  </Icon>
);

export const LogOutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Icon>
);

export const PrinterIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M6 14h12v7H6z" />
  </Icon>
);
