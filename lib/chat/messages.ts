import type { ChatLocale, DispatchChannel } from "../dispatch/types";
import type { FareBand } from "../types";

type ChatMessages = {
  picker: string;
  languageUpdated: string;
  welcome: (channel: DispatchChannel) => string;
  menuIntro: string;
  menuLangBtn: string;
  menuBookingHint: string;
  bookTaxi: string;
  newRequest: string;
  myRides: string;
  other: string;
  otherNeighborhoods: string;
  today: string;
  tomorrow: string;
  now: string;
  laterToday: string;
  anotherDay: string;
  earlier: string;
  laterDays: string;
  backWhen: string;
  backDay: string;
  askPickup: string;
  askPickupRepeat: string;
  choosePlace: string;
  samePickup: (label: string) => string;
  placeNoted: (side: "pickup" | "dropoff", place: {
    name: string;
    address: string;
    source?: string;
  }) => string;
  askDropoff: string;
  askWhen: string;
  askDay: string;
  askTime: (day: string) => string;
  askPax: string;
  askPhone: string;
  useThisWhatsApp: string;
  askZone: (side: "pickup" | "dropoff") => string;
  keyboardRemoved: string;
  confirm: string;
  edit: string;
  cancel: string;
  accept: string;
  decline: string;
  choose: string;
  options: string;
  shareLocation: string;
  shareContact: string;
  sendLocation: string;
  sendContact: string;
  notYourRequest: string;
  requestInactive: string;
  requestCancelled: (label: string) => string;
  draftCancelled: string;
  placeNotFound: string;
  typePickup: string;
  typeDestination: string;
  pickPlace: (query: string) => string;
  useTypedPlace: (query: string) => string;
  specifyDestination: string;
  noMoreToday: string;
  timePast: string;
  typeTime: string;
  chooseDay: string;
  chooseWhen: string;
  invalidPhone: string;
  searchingTaxi: (wait: string, label: string) => string;
  searchingCompanies: (wait: string, label: string) => string;
  noTaxiWentPrivate: (wait: string, label: string) => string;
  unfilled: (label: string) => string;
  callAStand: string;
  searchInProgress: string;
  offerExpired: string;
  offerGone: string;
  offerClosed: string;
  declineRecorded: string;
  declineQueued: string;
  declineOthersRemain: string;
  requestNotFound: string;
  rideTaken: string;
  holdWait: (wait: string) => string;
  holdPrompt: (wait: string) => string;
  holdExpired: (label: string) => string;
  holdExpiredDriver: string;
  holdRejected: string;
  holdRejectedDriver: string;
  loopbackExtra: (remaining: number, kind: "taxi" | "company") => string;
  driverUsage: string;
  companyUsage: string;
  onDutyBtn: string;
  offDutyBtn: string;
  staffOnDuty: string;
  staffOffDuty: string;
  staffBound: (who: string, kind: "taxi" | "company") => string;
  staffOff: string;
  staffHome: (who: string, onDuty: boolean) => string;
  sessionNudge: string;
  unknownTaxiPhone: string;
  recap: string;
  pickup: string;
  dropoff: string;
  when: string;
  passengers: (n: number) => string;
  clientPhone: string;
  taxiPhone: string;
  mapsPickup: string;
  mapsDropoff: string;
  zones: string;
  zonesTbd: string;
  taxiFare: string;
  fareTbd: string;
  fareTbdShort: string;
  fareOnBoard: string;
  fareGrid: (amount: string) => string;
  fareBand: (band: FareBand) => string;
  customZoneNote: string;
  driverAssignZone: string;
  askDriverZone: (side: "pickup" | "dropoff") => string;
  privateCompanyNote: string;
  payOnBoard: string;
  pressConfirm: string;
  taxiOffer: (wait: string) => string;
  companyOffer: (wait: string) => string;
  companyFareMissing: string;
  companyFareRef: (amount: string) => string;
  companyReplyYes: string;
  assigned: string;
  taxiAccepted: string;
  companyAccepted: string;
  companyRate: (amount: string) => string;
  rideAccepted: string;
  driverEnRoute: string;
  driverArrived: string;
  driverCompleted: string;
  bookerEnRoute: string;
  bookerArrived: string;
  bookerCompleted: string;
  reminderTitle: string;
  rideReleased: string;
  bookerRideReleased: string;
  notYourRide: string;
  rideNotActive: string;
  enRouteBtn: string;
  arrivedBtn: string;
  doneBtn: string;
  releaseBtn: string;
  noUpcoming: string;
  noBookings: string;
  yourRide: string;
  yourRides: (n: number) => string;
  yourBooking: string;
  yourBookings: (n: number) => string;
  whichRides: string;
  ridesAsDriver: string;
  ridesAsBooker: string;
  driverRideCount: (n: number) => string;
  bookerRideCount: (n: number) => string;
  listStatusSearching: string;
  listStatusHold: string;
  listStatusAssigned: string;
};

const fr: ChatMessages = {
  picker: "Ride Saint-Barth",
  languageUpdated: "C’est noté — la suite sera en français.",
  welcome: (channel) =>
    channel === "telegram"
      ? "Ride Saint-Barth\nTaxis agréés · tarif Collectivité · paiement à bord\nUniquement sur l’île.\n\nChauffeur : partagez votre numéro pour les offres."
      : "Ride Saint-Barth\nTaxis agréés · tarif Collectivité · paiement à bord\nUniquement sur l’île.",
  menuIntro: "Choisissez une action :",
  menuLangBtn: "Langue",
  menuBookingHint: "Une réservation est en cours. Annuler pour en sortir.",
  bookTaxi: "Commander un taxi",
  newRequest: "Nouvelle demande",
  myRides: "Mes courses",
  other: "Autre",
  otherNeighborhoods: "Autres quartiers",
  today: "Aujourd’hui",
  tomorrow: "Demain",
  now: "Maintenant",
  laterToday: "Plus tard aujourd’hui",
  anotherDay: "Un autre jour",
  earlier: "← Plus tôt",
  laterDays: "Plus loin →",
  backWhen: "← Quand",
  backDay: "← Jour",
  askPickup: "D’où part-on ? Partagez la position, ou tapez un nom :",
  askPickupRepeat: "Même départ qu’avant, ou un autre lieu :",
  choosePlace: "Ou choisissez un lieu :",
  samePickup: (label) => `Même départ · ${label}`,
  placeNoted: (side, place) => {
    const label = side === "pickup" ? "Départ" : "Arrivée";
    const source =
      place.source === "custom"
        ? "\nLieu personnalisé — le chauffeur confirmera le quartier."
        : place.source === "google"
          ? ""
          : "";
    const address =
      place.address && place.address !== place.name ? `\n${place.address}` : "";
    return `${label} : ${place.name}${address}${source}`;
  },
  askDropoff: "Où va-t-on ?",
  askWhen: "Quand ?",
  askDay: "Quel jour ?",
  askTime: (day) => `Quelle heure pour ${day} ?\nExemple : 21h00 ou 14:30`,
  askPax: "Combien de passagers ?",
  askPhone:
    "Numéro que le chauffeur appellera. Ce WhatsApp, un contact, ou tapez le numéro.",
  useThisWhatsApp: "Ce WhatsApp",
  askZone: (side) =>
    `Quel quartier tarifaire pour ${side === "pickup" ? "le départ" : "l’arrivée"} ?`,
  keyboardRemoved: "Clavier retiré — utilisez les boutons ci-dessous.",
  confirm: "Confirmer",
  edit: "Modifier",
  cancel: "Annuler",
  accept: "Accepter",
  decline: "Refuser",
  choose: "Choisir",
  options: "Options",
  shareLocation: "Partager ma position",
  shareContact: "Partager le contact",
  sendLocation: "Envoyez votre position via WhatsApp.",
  sendContact: "Envoyez le contact du client, ou tapez le numéro.",
  notYourRequest: "Cette demande ne vient pas de cette conversation.",
  requestInactive: "Cette demande n’est plus active.",
  requestCancelled: (label) => `Demande annulée : ${label}.`,
  draftCancelled:
    "Brouillon annulé. Les recherches déjà lancées continuent. /aide pour le menu.",
  placeNotFound:
    "Lieu introuvable. Partagez la position, tapez un nom, ou choisissez dans la liste.",
  typePickup: "Tapez le lieu de départ (villa, resto, quartier…).",
  typeDestination: "Tapez la destination (villa, resto, quartier…).",
  pickPlace: (query) => `Quel lieu pour « ${query} » ?`,
  useTypedPlace: (query) => `Utiliser « ${query} »`,
  specifyDestination: "Précisez la destination, ou choisissez dans la liste.",
  noMoreToday: "Plus aucun départ possible aujourd’hui. Choisissez un autre jour.",
  timePast: "Cet horaire est déjà passé. Indiquez une heure à venir.",
  typeTime: "Indiquez une heure (21h00, 14:30 ou 21).",
  chooseDay: "Choisissez un jour.",
  chooseWhen: "Choisissez : maintenant, plus tard aujourd’hui, ou un autre jour.",
  invalidPhone: "Numéro invalide. Tapez-le (ex. +590 690 …) ou partagez le contact.",
  searchingTaxi: (wait, label) => `Recherche d’un taxi (${wait})…\n${label}`,
  searchingCompanies: (wait, label) =>
    `Aucun taxi à la capacité demandée. Sociétés privées (${wait})…\n${label}`,
  noTaxiWentPrivate: (wait, label) =>
    `Aucun taxi n’a pris la course. On demande aux sociétés privées (${wait})…\n${label}`,
  unfilled: (label) => `Personne n’a pris la course.\n${label}`,
  callAStand: "Relancer, ou appeler une station :",
  searchInProgress:
    "Recherche en cours. Vous pouvez lancer une autre demande pour un autre client.",
  offerExpired: "Offre expirée.",
  offerGone: "Cette offre n’est plus disponible.",
  offerClosed: "Offre déjà close.",
  declineRecorded: "Refus enregistré.",
  declineQueued:
    "Refus enregistré. Prochaine offre dans 5 s, si l’anneau n’est pas fini.",
  declineOthersRemain: "Refus enregistré. Les autres de l’anneau restent en lice.",
  requestNotFound: "Demande introuvable.",
  rideTaken: "Cette course a été prise.",
  holdWait: (wait) =>
    `En attente de confirmation du client (${wait}). Ne partez pas encore.`,
  holdPrompt: (wait) =>
    `Confirmez dans les ${wait}, sinon la demande est annulée.`,
  holdExpired: (label) =>
    `Ce taxi n’a pas été confirmé à temps. La recherche continue.\n${label}`,
  holdExpiredDriver: "Le client n’a pas confirmé. La recherche continue sans vous.",
  holdRejected: "Refusé. La recherche continue.",
  holdRejectedDriver: "Le client a refusé. La recherche continue sans vous.",
  loopbackExtra: (remaining, kind) =>
    `\n\nMode test : ${remaining} ${kind === "taxi" ? "taxi" : "société"}${remaining > 1 ? "s" : ""} encore en lice. Refuser → prochaine offre dans 5 s si l’anneau n’est pas fini.`,
  driverUsage: "Usage : driver 12  (numéro ADS ou taxi-12)",
  companyUsage:
    "Usage : company prestige  (prestige, mobilite, sensation, caribbean-discovery, fifth-avenue)",
  onDutyBtn: "En service",
  offDutyBtn: "Hors service",
  staffOnDuty: "En service. Les offres arrivent ici.",
  staffOffDuty: "Hors service. Aucune nouvelle offre.",
  staffBound: (who) => `${who}\nEn service.`,
  staffOff: "Rôle chauffeur retiré.",
  staffHome: (who, onDuty) =>
    `${who}\n${onDuty ? "En service" : "Hors service"}`,
  sessionNudge: "Répondez ici pour rester joignable.",
  unknownTaxiPhone:
    "Ce numéro n’est pas un taxi du registre. Les offres vont sur le WhatsApp du chauffeur.",
  recap: "Récapitulatif",
  pickup: "Départ",
  dropoff: "Arrivée",
  when: "Quand",
  passengers: (n) => `${n} passager${n > 1 ? "s" : ""}`,
  clientPhone: "Tél. client",
  taxiPhone: "Tél. taxi",
  mapsPickup: "Carte — départ",
  mapsDropoff: "Carte — arrivée",
  zones: "Zones",
  zonesTbd: "quartiers à confirmer",
  taxiFare: "Tarif taxi (grille Collectivité)",
  fareTbd: "Tarif à confirmer",
  fareTbdShort: "à confirmer",
  fareOnBoard: "Tarif à confirmer à bord",
  fareGrid: (amount) => `Tarif : ${amount} (grille Collectivité)`,
  fareBand: (band) =>
    band === "night"
      ? "Nuit (0h–6h)"
      : band === "evening"
        ? "Soir, dimanche ou férié"
        : "Journée (6h–18h30)",
  customZoneNote:
    "Le chauffeur indiquera le quartier du lieu personnalisé avant de confirmer le tarif.",
  driverAssignZone:
    "Lieu personnalisé : à l’acceptation, choisissez le quartier pour afficher le tarif.",
  askDriverZone: (side) =>
    `Quel quartier tarifaire pour ${side === "pickup" ? "le départ" : "l’arrivée"} ?`,
  privateCompanyNote:
    "Si une société privée prend la course, elle confirmera son propre tarif.",
  payOnBoard: "Paiement à bord, au tarif affiché.",
  pressConfirm: "Appuyez sur Confirmer pour lancer la recherche.",
  taxiOffer: (wait) => `Offre taxi · ${wait}`,
  companyOffer: (wait) => `Course disponible · ${wait}`,
  companyFareMissing: "forfait taxi indisponible",
  companyFareRef: (amount) => `référence taxi ${amount}`,
  companyReplyYes:
    "Répondez oui pour prendre la course. Votre tarif sera envoyé au booker.",
  assigned: "Course attribuée.",
  taxiAccepted: "Un taxi a accepté.",
  companyAccepted: "Une société a accepté.",
  companyRate: (amount) => `Tarif société : ${amount}`,
  rideAccepted: "Course acceptée.",
  driverEnRoute: "En route vers le client.",
  driverArrived: "Arrivé au départ.",
  driverCompleted: "Course terminée.",
  bookerEnRoute: "Le taxi est en route vers le départ.",
  bookerArrived: "Le taxi est arrivé au départ.",
  bookerCompleted: "Course terminée.",
  reminderTitle: "Rappel · course dans 30 min",
  rideReleased: "Course libérée. Elle est renvoyée aux autres.",
  bookerRideReleased: "Le taxi a libéré la course. Nouvelle recherche…",
  notYourRide: "Cette course n’est pas à vous.",
  rideNotActive: "Cette course n’est plus active.",
  enRouteBtn: "En route",
  arrivedBtn: "Arrivé",
  doneBtn: "Terminé",
  releaseBtn: "Libérer",
  noUpcoming: "Aucune course à venir.",
  noBookings: "Aucune réservation en cours.",
  yourRide: "Votre course à venir",
  yourRides: (n) => `Vos courses à venir (${n})`,
  yourBooking: "Votre réservation",
  yourBookings: (n) => `Vos réservations (${n})`,
  whichRides: "Quelles courses ?",
  ridesAsDriver: "Au volant",
  ridesAsBooker: "Réservations",
  driverRideCount: (n) => `Au volant : ${n}`,
  bookerRideCount: (n) => `Réservations : ${n}`,
  listStatusSearching: "Recherche en cours",
  listStatusHold: "À confirmer",
  listStatusAssigned: "Taxi attribué",
};

const en: ChatMessages = {
  picker: "Ride Saint-Barth",
  languageUpdated: "Got it — I’ll continue in English.",
  welcome: (channel) =>
    channel === "telegram"
      ? "Ride Saint-Barth\nLicensed taxis · Collectivité fare · pay on board\nSaint-Barth only.\n\nDriver: share your number to receive offers."
      : "Ride Saint-Barth\nLicensed taxis · Collectivité fare · pay on board\nSaint-Barth only.",
  menuIntro: "Choose an action:",
  menuLangBtn: "Language",
  menuBookingHint: "A booking is in progress. Cancel to leave it.",
  bookTaxi: "Book a taxi",
  newRequest: "New request",
  myRides: "My rides",
  other: "Other",
  otherNeighborhoods: "More areas",
  today: "Today",
  tomorrow: "Tomorrow",
  now: "Now",
  laterToday: "Later today",
  anotherDay: "Another day",
  earlier: "← Earlier",
  laterDays: "Later →",
  backWhen: "← When",
  backDay: "← Day",
  askPickup: "Where from? Share your location, or type a name:",
  askPickupRepeat: "Same pickup as last time, or somewhere else:",
  choosePlace: "Or pick a place:",
  samePickup: (label) => `Same pickup · ${label}`,
  placeNoted: (side, place) => {
    const label = side === "pickup" ? "Pickup" : "Drop-off";
    const source =
      place.source === "custom"
        ? "\nCustom place — the driver will confirm the neighborhood."
        : place.source === "google"
          ? ""
          : "";
    const address =
      place.address && place.address !== place.name ? `\n${place.address}` : "";
    return `${label}: ${place.name}${address}${source}`;
  },
  askDropoff: "Where to?",
  askWhen: "When?",
  askDay: "Which day?",
  askTime: (day) => `What time on ${day}?\nExample: 21:00 or 14:30`,
  askPax: "How many passengers?",
  askPhone:
    "Number the driver will call. This WhatsApp, a contact, or type the number.",
  useThisWhatsApp: "This WhatsApp",
  askZone: (side) =>
    `Which fare neighborhood for ${side === "pickup" ? "pickup" : "drop-off"}?`,
  keyboardRemoved: "Keyboard hidden — use the buttons below.",
  confirm: "Confirm",
  edit: "Edit",
  cancel: "Cancel",
  accept: "Accept",
  decline: "Decline",
  choose: "Choose",
  options: "Options",
  shareLocation: "Share my location",
  shareContact: "Share contact",
  sendLocation: "Send your location in WhatsApp.",
  sendContact: "Send the guest’s contact, or type the number.",
  notYourRequest: "This request didn’t come from this chat.",
  requestInactive: "This request is no longer active.",
  requestCancelled: (label) => `Request cancelled: ${label}.`,
  draftCancelled:
    "Draft cancelled. Searches already running keep going. /help for the menu.",
  placeNotFound: "Place not found. Share your location, type a name, or pick from the list.",
  typePickup: "Type the pickup (villa, restaurant, neighborhood…).",
  typeDestination: "Type the destination (villa, restaurant, neighborhood…).",
  pickPlace: (query) => `Which place for “${query}”?`,
  useTypedPlace: (query) => `Use “${query}”`,
  specifyDestination: "Please specify the destination, or pick from the list.",
  noMoreToday: "No more departures today. Pick another day.",
  timePast: "That time has already passed. Enter a later time.",
  typeTime: "Enter a time (21:00, 14:30 or 21).",
  chooseDay: "Pick a day.",
  chooseWhen: "Choose: now, later today, or another day.",
  invalidPhone: "Invalid number. Type it (e.g. +590 690 …) or share the contact.",
  searchingTaxi: (wait, label) => `Looking for a taxi (${wait})…\n${label}`,
  searchingCompanies: (wait, label) =>
    `No taxi with enough seats. Asking private companies (${wait})…\n${label}`,
  noTaxiWentPrivate: (wait, label) =>
    `No taxi took the ride. Asking private companies (${wait})…\n${label}`,
  unfilled: (label) => `Nobody took the ride.\n${label}`,
  callAStand: "Try again, or call a stand:",
  searchInProgress: "Still searching. You can start another request for another guest.",
  offerExpired: "Offer expired.",
  offerGone: "This offer is no longer available.",
  offerClosed: "Offer already closed.",
  declineRecorded: "Decline recorded.",
  declineQueued: "Decline recorded. Next offer in 5 s if the ring is still open.",
  declineOthersRemain: "Decline recorded. Others in the ring are still in play.",
  requestNotFound: "Request not found.",
  rideTaken: "This ride was taken.",
  holdWait: (wait) =>
    `Waiting for the guest to confirm (${wait}). Don’t leave yet.`,
  holdPrompt: (wait) =>
    `Confirm within ${wait} or the request is cancelled.`,
  holdExpired: (label) =>
    `That taxi wasn’t confirmed in time. Still searching.\n${label}`,
  holdExpiredDriver: "The guest didn’t confirm. The search continues without you.",
  holdRejected: "Declined. Still searching.",
  holdRejectedDriver: "The guest declined. The search continues without you.",
  loopbackExtra: (remaining, kind) =>
    `\n\nTest mode: ${remaining} ${kind}${remaining > 1 ? "s" : ""} still in play. Decline → next offer in 5 s if the ring is still open.`,
  driverUsage: "Usage: driver 12  (ADS number or taxi-12)",
  companyUsage:
    "Usage: company prestige  (prestige, mobilite, sensation, caribbean-discovery, fifth-avenue)",
  onDutyBtn: "On duty",
  offDutyBtn: "Off duty",
  staffOnDuty: "On duty. Offers arrive here.",
  staffOffDuty: "Off duty. No new offers.",
  staffBound: (who) => `${who}\nOn duty.`,
  staffOff: "Driver role removed.",
  staffHome: (who, onDuty) =>
    `${who}\n${onDuty ? "On duty" : "Off duty"}`,
  sessionNudge: "Reply here to stay reachable.",
  unknownTaxiPhone:
    "This number isn’t a registered taxi. Offers go to the driver’s WhatsApp.",
  recap: "Summary",
  pickup: "Pickup",
  dropoff: "Drop-off",
  when: "When",
  passengers: (n) => `${n} passenger${n > 1 ? "s" : ""}`,
  clientPhone: "Guest phone",
  taxiPhone: "Taxi phone",
  mapsPickup: "Map — pickup",
  mapsDropoff: "Map — drop-off",
  zones: "Zones",
  zonesTbd: "neighborhoods to confirm",
  taxiFare: "Taxi fare (Collectivité grid)",
  fareTbd: "Fare to confirm",
  fareTbdShort: "to confirm",
  fareOnBoard: "Fare to confirm on board",
  fareGrid: (amount) => `Fare: ${amount} (Collectivité grid)`,
  fareBand: (band) =>
    band === "night"
      ? "Night (midnight–6am)"
      : band === "evening"
        ? "Evening, Sunday or holiday"
        : "Daytime (6am–6:30pm)",
  customZoneNote:
    "The driver will set the neighborhood for the custom place before the fare is confirmed.",
  driverAssignZone:
    "Custom place: on accept, pick the neighborhood to see the fare.",
  askDriverZone: (side) =>
    `Which fare neighborhood for ${side === "pickup" ? "pickup" : "drop-off"}?`,
  privateCompanyNote: "If a private company takes the ride, it will confirm its own fare.",
  payOnBoard: "Pay the driver on board, at the fare shown.",
  pressConfirm: "Tap Confirm to start the search.",
  taxiOffer: (wait) => `Taxi offer · ${wait}`,
  companyOffer: (wait) => `Ride available · ${wait}`,
  companyFareMissing: "taxi forfait unavailable",
  companyFareRef: (amount) => `taxi reference ${amount}`,
  companyReplyYes: "Reply yes to take the ride. Your fare will be sent to the booker.",
  assigned: "Ride assigned.",
  taxiAccepted: "A taxi accepted.",
  companyAccepted: "A company accepted.",
  companyRate: (amount) => `Company fare: ${amount}`,
  rideAccepted: "Ride accepted.",
  driverEnRoute: "On the way to the guest.",
  driverArrived: "Arrived at pickup.",
  driverCompleted: "Ride completed.",
  bookerEnRoute: "The taxi is on the way to pickup.",
  bookerArrived: "The taxi has arrived at pickup.",
  bookerCompleted: "Ride completed.",
  reminderTitle: "Reminder · ride in 30 min",
  rideReleased: "Ride released. It is going back out to others.",
  bookerRideReleased: "The taxi released the ride. Searching again…",
  notYourRide: "This ride isn’t yours.",
  rideNotActive: "This ride is no longer active.",
  enRouteBtn: "On my way",
  arrivedBtn: "Arrived",
  doneBtn: "Done",
  releaseBtn: "Release",
  noUpcoming: "No upcoming rides.",
  noBookings: "No bookings in progress.",
  yourRide: "Your upcoming ride",
  yourRides: (n) => `Your upcoming rides (${n})`,
  yourBooking: "Your booking",
  yourBookings: (n) => `Your bookings (${n})`,
  whichRides: "Which rides?",
  ridesAsDriver: "Driving",
  ridesAsBooker: "Booked",
  driverRideCount: (n) => `Driving: ${n}`,
  bookerRideCount: (n) => `Booked: ${n}`,
  listStatusSearching: "Still searching",
  listStatusHold: "Awaiting confirmation",
  listStatusAssigned: "Taxi assigned",
};

const catalog: Record<ChatLocale, ChatMessages> = { fr, en };

export function t(locale: ChatLocale): ChatMessages {
  return catalog[locale] ?? fr;
}

export const LANG_BUTTONS = [
  [
    { id: "lang:fr", label: "Français" },
    { id: "lang:en", label: "English" },
  ],
] as const;

export function fareBandLabel(locale: ChatLocale, band: FareBand) {
  return t(locale).fareBand(band);
}
