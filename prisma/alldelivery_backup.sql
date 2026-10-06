--
-- PostgreSQL database dump
--

\restrict vVT6f8XzmWRQDblFEfhJEd9gwMxAGpg9OkcQ31rqSce7qVWDfBm4cAA2mhUhGGy

-- Dumped from database version 17.9
-- Dumped by pg_dump version 17.9

-- Started on 2026-10-06 14:16:41

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 5 (class 2615 OID 18035)
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- TOC entry 927 (class 1247 OID 18915)
-- Name: ComandaStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ComandaStatus" AS ENUM (
    'LIVRE',
    'OCUPADA',
    'INATIVA'
);


ALTER TYPE public."ComandaStatus" OWNER TO postgres;

--
-- TOC entry 867 (class 1247 OID 18050)
-- Name: OrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OrderStatus" AS ENUM (
    'NOVO',
    'EM_PREPARO',
    'EM_ROTA',
    'PRONTO_RETIRADA',
    'ENTREGUE',
    'COMANDA_MESA',
    'CANCELADO'
);


ALTER TYPE public."OrderStatus" OWNER TO postgres;

--
-- TOC entry 870 (class 1247 OID 18064)
-- Name: OrderType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."OrderType" AS ENUM (
    'DELIVERY',
    'RETIRADA',
    'COMANDA'
);


ALTER TYPE public."OrderType" OWNER TO postgres;

--
-- TOC entry 873 (class 1247 OID 18072)
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'PIX',
    'DINHEIRO',
    'CREDITO',
    'DEBITO'
);


ALTER TYPE public."PaymentMethod" OWNER TO postgres;

--
-- TOC entry 876 (class 1247 OID 18082)
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'MANAGER',
    'KITCHEN',
    'DRIVER',
    'GARCOM'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 228 (class 1259 OID 18165)
-- Name: AdminUser; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AdminUser" (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    role public."UserRole" DEFAULT 'KITCHEN'::public."UserRole" NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "driverLat" double precision,
    "driverLng" double precision,
    "driverUpdatedAt" timestamp(3) without time zone,
    active boolean DEFAULT true NOT NULL
);


ALTER TABLE public."AdminUser" OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 18097)
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    name text NOT NULL
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 18926)
-- Name: Comanda; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Comanda" (
    id text NOT NULL,
    number integer NOT NULL,
    status public."ComandaStatus" DEFAULT 'LIVRE'::public."ComandaStatus" NOT NULL,
    "responsibleName" text,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Comanda" OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 18174)
-- Name: CrustType; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CrustType" (
    id text NOT NULL,
    name text NOT NULL,
    "pricePM" double precision NOT NULL,
    "priceGGG" double precision NOT NULL,
    caracol boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."CrustType" OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 18157)
-- Name: CustomerContactProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CustomerContactProfile" (
    id text NOT NULL,
    "phoneKey" text NOT NULL,
    notes text,
    "displayNameOverride" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CustomerContactProfile" OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 18118)
-- Name: DeliveryZone; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DeliveryZone" (
    id text NOT NULL,
    title text NOT NULL,
    geometry jsonb NOT NULL,
    "deliveryFee" double precision NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."DeliveryZone" OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 18859)
-- Name: DriverActiveRoute; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."DriverActiveRoute" (
    "driverId" text NOT NULL,
    "orderedIds" text[],
    steps jsonb NOT NULL,
    "routeGeometry" jsonb NOT NULL,
    summary jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."DriverActiveRoute" OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 18128)
-- Name: Order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Order" (
    id text NOT NULL,
    "orderNumber" integer NOT NULL,
    status public."OrderStatus" DEFAULT 'NOVO'::public."OrderStatus" NOT NULL,
    type public."OrderType" DEFAULT 'DELIVERY'::public."OrderType" NOT NULL,
    "customerName" text NOT NULL,
    "customerPhone" text NOT NULL,
    "customerAddress" text,
    "addressNumber" text,
    reference text,
    "customerLat" double precision,
    "customerLng" double precision,
    "paymentMethod" public."PaymentMethod" DEFAULT 'PIX'::public."PaymentMethod" NOT NULL,
    "changeFor" double precision,
    subtotal double precision NOT NULL,
    "deliveryFee" double precision DEFAULT 0 NOT NULL,
    total double precision NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "preparedAt" timestamp(3) without time zone,
    "sentAt" timestamp(3) without time zone,
    "readyForPickupAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "driverId" text,
    "comandaId" text
);


ALTER TABLE public."Order" OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 18141)
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItem" (
    id text NOT NULL,
    "orderId" text NOT NULL,
    name text NOT NULL,
    quantity integer NOT NULL,
    "basePrice" double precision NOT NULL,
    "totalPrice" double precision NOT NULL,
    "isPizza" boolean DEFAULT false NOT NULL,
    "pizzaSize" text,
    "crustType" text,
    "crustPrice" double precision DEFAULT 0 NOT NULL
);


ALTER TABLE public."OrderItem" OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 18150)
-- Name: OrderItemFlavor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItemFlavor" (
    id text NOT NULL,
    "orderItemId" text NOT NULL,
    "flavorName" text NOT NULL,
    "categoryName" text NOT NULL
);


ALTER TABLE public."OrderItemFlavor" OWNER TO postgres;

--
-- TOC entry 232 (class 1259 OID 18877)
-- Name: OrderItemTopping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItemTopping" (
    id text NOT NULL,
    "orderItemId" text NOT NULL,
    "toppingName" text NOT NULL,
    "targetType" text NOT NULL,
    "flavorName" text,
    "slicesCount" integer DEFAULT 1 NOT NULL,
    "totalSlices" integer DEFAULT 1 NOT NULL,
    price double precision NOT NULL
);


ALTER TABLE public."OrderItemTopping" OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 18127)
-- Name: Order_orderNumber_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Order_orderNumber_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Order_orderNumber_seq" OWNER TO postgres;

--
-- TOC entry 5092 (class 0 OID 0)
-- Dependencies: 223
-- Name: Order_orderNumber_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Order_orderNumber_seq" OWNED BY public."Order"."orderNumber";


--
-- TOC entry 220 (class 1259 OID 18104)
-- Name: PizzaCategory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PizzaCategory" (
    id text NOT NULL,
    name text NOT NULL,
    "priceP" double precision NOT NULL,
    "priceM" double precision NOT NULL,
    "priceG" double precision NOT NULL,
    "priceGG" double precision NOT NULL
);


ALTER TABLE public."PizzaCategory" OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 18111)
-- Name: PizzaFlavor; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PizzaFlavor" (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    "imageUrl" text NOT NULL,
    "pizzaCategoryId" text NOT NULL
);


ALTER TABLE public."PizzaFlavor" OWNER TO postgres;

--
-- TOC entry 234 (class 1259 OID 18894)
-- Name: PizzaTopping; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PizzaTopping" (
    id text NOT NULL,
    name text NOT NULL,
    "pricePM" double precision NOT NULL,
    "priceGGG" double precision NOT NULL,
    "isUnit" boolean DEFAULT false NOT NULL,
    "categoryId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PizzaTopping" OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 18886)
-- Name: PizzaToppingCategory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PizzaToppingCategory" (
    id text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."PizzaToppingCategory" OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 18089)
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    price double precision NOT NULL,
    "imageUrl" text NOT NULL,
    "categoryId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 18851)
-- Name: SystemConfig; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SystemConfig" (
    key text NOT NULL,
    value text NOT NULL
);


ALTER TABLE public."SystemConfig" OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 18036)
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- TOC entry 4830 (class 2604 OID 18131)
-- Name: Order orderNumber; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order" ALTER COLUMN "orderNumber" SET DEFAULT nextval('public."Order_orderNumber_seq"'::regclass);


--
-- TOC entry 5077 (class 0 OID 18165)
-- Dependencies: 228
-- Data for Name: AdminUser; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AdminUser" (id, email, "passwordHash", role, name, "createdAt", "updatedAt", "driverLat", "driverLng", "driverUpdatedAt", active) FROM stdin;
cmuh5aa0q0000vwojnpk67xwi	admin@alldelivery.com	$2a$10$U989escjbMiGByCSwhGvwe34IJy6.kxvSXpTQeeIgc/PTAhQUFkj.	ADMIN	Administrador Geral	2026-09-25 15:58:02.81	2026-09-25 15:58:02.81	\N	\N	\N	t
cmuha5ga80018h5azzrmek1oe	garcom@teste.com	$2a$10$nYo0p8Wyye2CJ2Orx6uCc.TxjmOE6qnkCeAhNao2r3LkDFzxXeWMu	GARCOM	garcom	2026-09-25 18:14:15.729	2026-09-25 18:14:15.729	\N	\N	\N	t
\.


--
-- TOC entry 5068 (class 0 OID 18097)
-- Dependencies: 219
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Category" (id, name) FROM stdin;
cmuh5aa2s003xvwoj4f10xj8q	Bebidas
\.


--
-- TOC entry 5084 (class 0 OID 18926)
-- Dependencies: 235
-- Data for Name: Comanda; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Comanda" (id, number, status, "responsibleName", active, "createdAt", "updatedAt") FROM stdin;
cmtc015il000rfrt0fsrc97nl	5	LIVRE	\N	t	2026-08-27 20:52:25.774	2026-08-27 20:52:25.774
cmtc015im000sfrt0c5ipome4	6	LIVRE	\N	t	2026-08-27 20:52:25.775	2026-08-27 20:52:25.775
cmtc015in000tfrt0l716c0k0	7	LIVRE	\N	t	2026-08-27 20:52:25.776	2026-08-27 20:52:25.776
cmtc015io000ufrt0uctaa9od	8	LIVRE	\N	t	2026-08-27 20:52:25.776	2026-08-27 20:52:25.776
cmtc015ip000vfrt0rc46e362	9	LIVRE	\N	t	2026-08-27 20:52:25.777	2026-08-27 20:52:25.777
cmtc015ip000wfrt0iekcckzl	10	LIVRE	\N	t	2026-08-27 20:52:25.778	2026-08-27 20:52:25.778
cmtc015il000qfrt0agex4fy5	4	OCUPADA	\N	t	2026-08-27 20:52:25.773	2026-09-25 19:40:59.259
cmtc015ik000pfrt0gqkd53bx	3	LIVRE	\N	t	2026-08-27 20:52:25.772	2026-10-01 17:49:03.377
cmtc015ij000ofrt07xkkiozl	2	LIVRE	\N	t	2026-08-27 20:52:25.772	2026-10-01 17:49:20.374
cmtc015ih000nfrt0h54bj1pd	1	LIVRE	\N	t	2026-08-27 20:52:25.769	2026-10-01 18:02:05.2
\.


--
-- TOC entry 5078 (class 0 OID 18174)
-- Dependencies: 229
-- Data for Name: CrustType; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CrustType" (id, name, "pricePM", "priceGGG", caracol, "createdAt", "updatedAt") FROM stdin;
cmuh5aa2l003nvwojus7y6si9	Catupiry	5	8	f	2026-09-25 15:58:02.877	2026-09-25 15:58:02.877
cmuh5aa2m003ovwojec7jrna6	Cheddar	5	8	f	2026-09-25 15:58:02.879	2026-09-25 15:58:02.879
cmuh5aa2n003pvwoj7e7xs0h1	Requeijão	6	9	f	2026-09-25 15:58:02.879	2026-09-25 15:58:02.879
cmuh5aa2o003qvwoja4041ugf	Cream Cheese	6	9	f	2026-09-25 15:58:02.88	2026-09-25 15:58:02.88
cmuh5aa2o003rvwojgnw0jzmd	Mussarela	7	10	f	2026-09-25 15:58:02.881	2026-09-25 15:58:02.881
cmuh5aa2p003svwoj7eo7zwzl	Chocolate	7	10	f	2026-09-25 15:58:02.881	2026-09-25 15:58:02.881
cmuh5aa2p003tvwojh3rl8dyk	Nutella	8	11	f	2026-09-25 15:58:02.882	2026-09-25 15:58:02.882
cmuh5aa2q003uvwojpvgvl10f	Catupiry Original	8	11	f	2026-09-25 15:58:02.882	2026-09-25 15:58:02.882
cmuh5aa2q003vvwojnvqhzglg	Cheddar Original	8	11	f	2026-09-25 15:58:02.883	2026-09-25 15:58:02.883
cmuh5aa2r003wvwojkjc7qwwx	Cream Cheese Original	8	11	f	2026-09-25 15:58:02.883	2026-09-25 15:58:02.883
\.


--
-- TOC entry 5076 (class 0 OID 18157)
-- Dependencies: 227
-- Data for Name: CustomerContactProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CustomerContactProfile" (id, "phoneKey", notes, "displayNameOverride", "createdAt") FROM stdin;
cmun6vu54000l14aafjwe63kd	81920000221	\N	\N	2026-09-29 21:29:25.337
\.


--
-- TOC entry 5071 (class 0 OID 18118)
-- Dependencies: 222
-- Data for Name: DeliveryZone; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DeliveryZone" (id, title, geometry, "deliveryFee", "isActive", "createdAt") FROM stdin;
cmuogxfy800004qg1jbvs5zno	Piscinas	{"type": "Polygon", "coordinates": [[[-36.22716387852967, -8.484851501310827], [-36.23012412179689, -8.480988929391735], [-36.23008490819723, -8.47793280101781], [-36.22905525836516, -8.476956532666085], [-36.22703886077736, -8.477168765127368], [-36.22506536526587, -8.47861194275662], [-36.22437893204449, -8.479715545522733], [-36.22527987564755, -8.482814105578031], [-36.22716387852967, -8.484851501310827]]]}	5	t	2026-09-30 18:58:22.592
cmuogyq7h00014qg16zusz136	Depois do curral	{"type": "Polygon", "coordinates": [[[-36.24149784896143, -8.497754756532618], [-36.24570225244242, -8.49569620707627], [-36.24831927909894, -8.496651205620692], [-36.24907006543482, -8.499770850959274], [-36.24707511888518, -8.501426162668027], [-36.24493001506836, -8.501786934784034], [-36.24278491125154, -8.500810727098225], [-36.24136914273242, -8.498370197007995], [-36.24149784896143, -8.497754756532618]]]}	5	t	2026-09-30 18:59:22.542
cmuoh0me900024qg1cu1vfxpo	Depois do clue	{"type": "Polygon", "coordinates": [[[-36.22716418369141, -8.491006068605902], [-36.22838689286699, -8.494168204459653], [-36.23139003821056, -8.492703862907915], [-36.22883736466854, -8.490369393806207], [-36.22716418369141, -8.491006068605902]]]}	5	t	2026-09-30 19:00:50.913
cmuoh1ljy00034qg1fsel64vl	Posto cristo rei	{"type": "Polygon", "coordinates": [[[-36.22505809113871, -8.482294143477946], [-36.22235526032953, -8.483217341007881], [-36.22082151110049, -8.480999540906248], [-36.22415714753565, -8.480214288040791], [-36.22505809113871, -8.482294143477946]]]}	5	t	2026-09-30 19:01:36.479
\.


--
-- TOC entry 5080 (class 0 OID 18859)
-- Dependencies: 231
-- Data for Name: DriverActiveRoute; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."DriverActiveRoute" ("driverId", "orderedIds", steps, "routeGeometry", summary, "createdAt", "updatedAt") FROM stdin;
\.


--
-- TOC entry 5073 (class 0 OID 18128)
-- Dependencies: 224
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Order" (id, "orderNumber", status, type, "customerName", "customerPhone", "customerAddress", "addressNumber", reference, "customerLat", "customerLng", "paymentMethod", "changeFor", subtotal, "deliveryFee", total, notes, "createdAt", "preparedAt", "sentAt", "readyForPickupAt", "deliveredAt", "driverId", "comandaId") FROM stdin;
cmun7jb6t000n14aakde8q3x5	29	EM_PREPARO	DELIVERY	Gustavo	81920000221	Rua José Alves de Andrade	123	teste	-8.486583985177605	-36.23606205100356	PIX	\N	90	5	95		2026-09-29 21:47:40.517	2026-09-29 21:55:39.916	\N	\N	\N	\N	\N
cmun7urq9001814aaoqyitpch	30	EM_PREPARO	DELIVERY	Gustavo	81920000221	Rua José Alves de Andrade	123	teste	-8.486583985177605	-36.23606205100356	PIX	\N	152.25	5	157.25		2026-09-29 21:56:35.17	2026-09-29 21:56:44.663	\N	\N	\N	\N	\N
cmuhd8zcx001qh5az8a9o817f	27	EM_PREPARO	COMANDA	Mesa 4 (Mesa 4)	Mesa 4	\N	\N	Auto-atendimento QR Code Mesa 4	\N	\N	DINHEIRO	\N	14	0	14	\N	2026-09-25 19:40:59.265	2026-09-25 19:40:59.262	\N	\N	\N	\N	cmtc015il000qfrt0agex4fy5
cmupstf3y000boo37gpvnmdx9	33	CANCELADO	DELIVERY	Teste Cancelado	11999999999	\N	\N	\N	\N	\N	PIX	\N	99	0	99	\N	2026-10-01 17:18:56.446	\N	\N	\N	\N	\N	\N
cmupstm2t000foo370400jkec	34	ENTREGUE	DELIVERY	Teste Concluido	11999999999	\N	\N	\N	\N	\N	PIX	\N	45	0	45	\N	2026-10-01 17:19:05.478	\N	\N	\N	2026-10-01 17:19:05.516	\N	\N
cmupsqsig0007oo37i0t4dnfn	32	ENTREGUE	COMANDA	Teste Mesa Cozinha	00000000000	\N	\N	\N	\N	\N	DINHEIRO	\N	50	0	50	\N	2026-10-01 17:16:53.848	2026-10-01 17:16:53.847	\N	\N	2026-10-01 17:19:17.983	\N	\N
cmuh5zihh0003cpzds0bxts3d	21	ENTREGUE	COMANDA	Cliente Teste QR Code (Mesa 1)	Mesa 1	\N	\N	Auto-atendimento QR Code Mesa 1	\N	\N	DINHEIRO	\N	63	0	63	Sem cebola, bem assada	2026-09-25 16:17:40.181	2026-09-25 16:17:40.179	\N	2026-09-25 16:35:43.241	2026-10-01 17:19:17.983	\N	\N
cmuh8pl5f0003h5azx24g8wkl	22	ENTREGUE	COMANDA	Mesa 1 (Mesa 1)	Mesa 1	\N	\N	Auto-atendimento QR Code Mesa 1	\N	\N	DINHEIRO	\N	81	0	81	\N	2026-09-25 17:33:55.923	2026-09-25 17:33:55.922	\N	\N	2026-10-01 17:19:17.983	\N	\N
cmuh8rjkp000fh5azt84rwv6a	23	ENTREGUE	COMANDA	Mesa 1 (Mesa 1)	Mesa 1	\N	\N	Auto-atendimento QR Code Mesa 1	\N	\N	DINHEIRO	\N	72	0	72	\N	2026-09-25 17:35:27.193	2026-09-25 17:35:27.191	\N	\N	2026-10-01 17:19:17.983	\N	\N
cmuh8t4ea000ph5az395u7hx0	24	ENTREGUE	COMANDA	Mesa 1 (Mesa 1)	Mesa 1	\N	\N	Auto-atendimento QR Code Mesa 1	\N	\N	DINHEIRO	\N	91	0	91	\N	2026-09-25 17:36:40.834	2026-09-25 17:36:40.833	\N	2026-09-25 18:15:03.772	2026-10-01 17:19:17.983	\N	\N
cmuhb0r4u001ch5az4ikl5yl3	26	ENTREGUE	COMANDA	Mesa 3 (Mesa 3)	Mesa 3	\N	\N	Auto-atendimento QR Code Mesa 3	\N	\N	DINHEIRO	\N	90	0	90	\N	2026-09-25 18:38:36.126	2026-09-25 18:38:36.124	\N	\N	2026-10-01 17:49:03.365	\N	\N
cmuha22tk0012h5az4jlyiwdv	25	ENTREGUE	COMANDA	Mesa 2 (Mesa 2)	Mesa 2	\N	\N	Auto-atendimento QR Code Mesa 2	\N	\N	DINHEIRO	\N	63	0	63	\N	2026-09-25 18:11:38.312	2026-09-25 18:11:38.311	\N	2026-09-25 18:14:50.546	2026-10-01 17:49:20.369	\N	\N
cmun6vu4j000214aagfov07cg	28	EM_PREPARO	DELIVERY	Gustavo	81920000221	Rua José Alves de Andrade	123	teste	-8.486528125803787	-36.23607618730639	PIX	\N	80.25	5	85.25		2026-09-29 21:29:25.315	2026-09-29 21:29:53.662	\N	\N	\N	\N	\N
\.


--
-- TOC entry 5074 (class 0 OID 18141)
-- Dependencies: 225
-- Data for Name: OrderItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderItem" (id, "orderId", name, quantity, "basePrice", "totalPrice", "isPizza", "pizzaSize", "crustType", "crustPrice") FROM stdin;
cmuh5zihh0004cpzdl20ib3j0	cmuh5zihh0003cpzds0bxts3d	Pizza G (Calabresa / Mussarela)	1	63	63	t	G	Catupiry	8
cmuh8pl5f0004h5azgthyrrc8	cmuh8pl5f0003h5azx24g8wkl	Pizza Customizada G (3 fatias Atum / 3 fatias Bacon X / 2 fatias Água na Boca)	1	76	76	t	G	Catupiry Original	11
cmuh8pl5f000bh5azep6cdsfj	cmuh8pl5f0003h5azx24g8wkl	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmuh8rjkp000gh5azb11erte3	cmuh8rjkp000fh5azt84rwv6a	Pizza Customizada G (5 fatias Baiana / 3 fatias Água na Boca)	1	63	63	t	G	Catupiry	8
cmuh8rjkp000lh5azu19jk6wj	cmuh8rjkp000fh5azt84rwv6a	Guaraná Antártica 2L	1	9	9	f	\N	\N	0
cmuh8t4ea000qh5aztmz4lp8k	cmuh8t4ea000ph5az395u7hx0	Pizza Customizada G (2 fatias Atum / 3 fatias Bacon X / 3 fatias Água na Boca)	1	76	76	t	G	Cheddar Original	11
cmuh8t4ea000xh5azzhvu9oqc	cmuh8t4ea000ph5az395u7hx0	Coca-Cola 2L	1	10	10	f	\N	\N	0
cmuh8t4ea000yh5azhactudce	cmuh8t4ea000ph5az395u7hx0	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmuha22tk0013h5azdqqsavev	cmuha22tk0012h5az4jlyiwdv	Pizza Customizada G (4 fatias Atum / 4 fatias Água na Boca)	1	63	63	t	G	Cheddar	8
cmuhb0r4u001dh5az2s31zo8b	cmuhb0r4u001ch5az4ikl5yl3	Pizza Customizada GG (4 fatias Banana com Canela / 3 fatias Calabresa / 3 fatias Água na Boca)	1	75	75	t	GG	Chocolate	10
cmuhb0r4u001lh5azytri4erm	cmuhb0r4u001ch5az4ikl5yl3	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmuhb0r4u001mh5azv4tba2gi	cmuhb0r4u001ch5az4ikl5yl3	Coca-Cola 2L	1	10	10	f	\N	\N	0
cmuhd8zcx001zh5azo2qc8j73	cmuhd8zcx001qh5az8a9o817f	Guaraná Antártica 2L	1	9	9	f	\N	\N	0
cmuhd8zcx0020h5aznsrq2dge	cmuhd8zcx001qh5az8a9o817f	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmun6vu4r000414aavzdfao3i	cmun6vu4j000214aagfov07cg	Pizza Customizada G (3 fatias Atum / 3 fatias Bacon / 2 fatias Água na Boca)	1	75.25	75.25	t	G	\N	0
cmun6vu53000k14aad4x7qqly	cmun6vu4j000214aagfov07cg	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmun7jb6w000p14aarp8oopou	cmun7jb6t000n14aakde8q3x5	Pizza Customizada G (4 fatias Baiana / 4 fatias Água na Boca)	1	85	85	t	G	\N	0
cmun7jb78001514aaaqdsy614	cmun7jb6t000n14aakde8q3x5	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmun7urqc001a14aayngvegtq	cmun7urq9001814aaoqyitpch	Pizza Customizada G (4 fatias Peperone / 4 fatias Atum)	1	67	67	t	G	\N	0
cmun7urqh001k14aatlnsy473	cmun7urq9001814aaoqyitpch	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmun7urqi001m14aa5u14up4a	cmun7urq9001814aaoqyitpch	Pizza Customizada G (3 fatias Atum / 3 fatias Bacon / 2 fatias Água na Boca)	1	75.25	75.25	t	G	\N	0
cmun7urqq002214aalriy1oaq	cmun7urq9001814aaoqyitpch	Coca-Cola Lata	1	5	5	f	\N	\N	0
cmupsqsig0008oo379zt4ftru	cmupsqsig0007oo37i0t4dnfn	Pizza Teste Cozinha	1	50	50	t	\N	\N	0
cmupstf3y000coo37otzhjpqh	cmupstf3y000boo37gpvnmdx9	Pizza Cancelada	1	99	99	t	\N	\N	0
cmupstm2u000goo37yku2jd5u	cmupstm2t000foo370400jkec	Pizza Concluida	1	45	45	t	\N	\N	0
\.


--
-- TOC entry 5075 (class 0 OID 18150)
-- Dependencies: 226
-- Data for Name: OrderItemFlavor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderItemFlavor" (id, "orderItemId", "flavorName", "categoryName") FROM stdin;
cmuh5zihh0005cpzdob260pl5	cmuh5zihh0004cpzdl20ib3j0	Calabresa	Especiais
cmuh5zihh0006cpzd67qwexx9	cmuh5zihh0004cpzdl20ib3j0	Mussarela	Tradicionais
cmuh8pl5f0005h5aznhbza1t3	cmuh8pl5f0004h5azgthyrrc8	Atum	Tradicionais
cmuh8pl5f0006h5azws9z195v	cmuh8pl5f0004h5azgthyrrc8	Bacon X	Premium
cmuh8pl5f0007h5azc0z7mw06	cmuh8pl5f0004h5azgthyrrc8	Água na Boca	Especiais
cmuh8rjkp000hh5az3vyadk6i	cmuh8rjkp000gh5azb11erte3	Baiana	Especiais
cmuh8rjkp000ih5az6be1l33p	cmuh8rjkp000gh5azb11erte3	Água na Boca	Especiais
cmuh8t4ea000rh5azm668sfxh	cmuh8t4ea000qh5aztmz4lp8k	Atum	Tradicionais
cmuh8t4ea000sh5azpje2bvmh	cmuh8t4ea000qh5aztmz4lp8k	Bacon X	Premium
cmuh8t4ea000th5azmfbrwtsl	cmuh8t4ea000qh5aztmz4lp8k	Água na Boca	Especiais
cmuha22tk0014h5azab2t290f	cmuha22tk0013h5azdqqsavev	4 fatias Atum	Tradicionais
cmuha22tk0015h5az95cf411n	cmuha22tk0013h5azdqqsavev	4 fatias Água na Boca	Especiais
cmuhb0r4u001eh5azp8jsvrzx	cmuhb0r4u001dh5az2s31zo8b	4 fatias Banana com Canela	Doces
cmuhb0r4u001fh5aznm5bfeg0	cmuhb0r4u001dh5az2s31zo8b	3 fatias Calabresa	Especiais
cmuhb0r4u001gh5azko7a4hsk	cmuhb0r4u001dh5az2s31zo8b	3 fatias Água na Boca	Especiais
cmun6vu4u000614aazybrwhk4	cmun6vu4r000414aavzdfao3i	3 fatias Atum	Tradicionais
cmun6vu4w000814aab7x3rpse	cmun6vu4r000414aavzdfao3i	3 fatias Bacon	Especiais
cmun6vu4x000a14aadylh1m8j	cmun6vu4r000414aavzdfao3i	2 fatias Água na Boca	Especiais
cmun7jb71000r14aajtwi7l7c	cmun7jb6w000p14aarp8oopou	4 fatias Baiana	Especiais
cmun7jb73000t14aax6mao0wn	cmun7jb6w000p14aarp8oopou	4 fatias Água na Boca	Especiais
cmun7urqd001c14aapj7ud8hz	cmun7urqc001a14aayngvegtq	4 fatias Peperone	Especiais
cmun7urqe001e14aa8zlwac26	cmun7urqc001a14aayngvegtq	4 fatias Atum	Tradicionais
cmun7urqj001o14aaar9o61gh	cmun7urqi001m14aa5u14up4a	3 fatias Atum	Tradicionais
cmun7urqj001q14aasua38q8c	cmun7urqi001m14aa5u14up4a	3 fatias Bacon	Especiais
cmun7urqm001s14aakgbrtwnv	cmun7urqi001m14aa5u14up4a	2 fatias Água na Boca	Especiais
\.


--
-- TOC entry 5081 (class 0 OID 18877)
-- Dependencies: 232
-- Data for Name: OrderItemTopping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderItemTopping" (id, "orderItemId", "toppingName", "targetType", "flavorName", "slicesCount", "totalSlices", price) FROM stdin;
cmuh8pl5f0008h5azg44mpc4x	cmuh8pl5f0004h5azgthyrrc8	Catupiry	FLAVOR	Atum	3	8	2.25
cmuh8pl5f0009h5azcslw8coa	cmuh8pl5f0004h5azgthyrrc8	Cheddar Original	FLAVOR	Bacon X	3	8	6.75
cmuh8pl5f000ah5azatg99k86	cmuh8pl5f0004h5azgthyrrc8	Banana	FLAVOR	Água na Boca	2	8	2.5
cmuh8rjkp000jh5azpqmfgytl	cmuh8rjkp000gh5azb11erte3	Banana	FLAVOR	Baiana	5	8	6.25
cmuh8rjkp000kh5az054t0cm3	cmuh8rjkp000gh5azb11erte3	Morango	FLAVOR	Água na Boca	3	8	5.25
cmuh8t4ea000uh5azya2ra7na	cmuh8t4ea000qh5aztmz4lp8k	Catupiry	FLAVOR	Água na Boca	3	8	2.25
cmuh8t4ea000vh5az9aqn63r6	cmuh8t4ea000qh5aztmz4lp8k	Cheddar Original	FLAVOR	Atum	2	8	4.5
cmuh8t4ea000wh5az13x7ryc2	cmuh8t4ea000qh5aztmz4lp8k	Cheddar	FLAVOR	Bacon X	3	8	2.25
cmuha22tk0016h5azu6rj1xvn	cmuha22tk0013h5azdqqsavev	Catupiry	FLAVOR	Água na Boca	4	8	3
cmuha22tk0017h5az8p1mcgai	cmuha22tk0013h5azdqqsavev	Cheddar Original	FLAVOR	Atum	4	8	9
cmuhb0r4u001hh5azvwja0iof	cmuhb0r4u001dh5az2s31zo8b	Chocolate Avelã	FLAVOR	Água na Boca	3	10	4.8
cmuhb0r4u001ih5az1jplqdo8	cmuhb0r4u001dh5az2s31zo8b	Chocolate Branco	FLAVOR	Água na Boca	3	10	3.6
cmuhb0r4u001jh5azpkz8i0tu	cmuhb0r4u001dh5az2s31zo8b	Banana	FLAVOR	Calabresa	3	10	3
cmuhb0r4u001kh5az1xb28ffy	cmuhb0r4u001dh5az2s31zo8b	Uva	FLAVOR	Banana com Canela	4	10	5.6
cmun6vu4y000c14aaxw2lgegn	cmun6vu4r000414aavzdfao3i	Catupiry Original	FLAVOR	Atum	3	8	6.75
cmun6vu51000e14aa2ewswk38	cmun6vu4r000414aavzdfao3i	Cheddar	FLAVOR	Atum	3	8	2.25
cmun6vu52000g14aa657kn34d	cmun6vu4r000414aavzdfao3i	Cheddar Original	FLAVOR	Bacon	3	8	6.75
cmun6vu53000i14aauey4mk30	cmun6vu4r000414aavzdfao3i	Cheddar Original	FLAVOR	Água na Boca	2	8	4.5
cmun7jb74000v14aazkbpis41	cmun7jb6w000p14aarp8oopou	Catupiry	FLAVOR	Baiana	4	8	3
cmun7jb75000x14aa68i8udvn	cmun7jb6w000p14aarp8oopou	Catupiry Original	FLAVOR	Baiana	4	8	9
cmun7jb76000z14aae9km6wnm	cmun7jb6w000p14aarp8oopou	Catupiry Original	FLAVOR	Água na Boca	4	8	9
cmun7jb76001114aag55wpg03	cmun7jb6w000p14aarp8oopou	Cheddar	FLAVOR	Água na Boca	4	8	3
cmun7jb77001314aajufng8jo	cmun7jb6w000p14aarp8oopou	Catupiry	FULL	\N	8	8	6
cmun7urqf001g14aavg2w21n1	cmun7urqc001a14aayngvegtq	Catupiry	FLAVOR	Peperone	4	8	3
cmun7urqg001i14aa2cfljqxu	cmun7urqc001a14aayngvegtq	Catupiry Original	FLAVOR	Atum	4	8	9
cmun7urqn001u14aauph46dqi	cmun7urqi001m14aa5u14up4a	Catupiry Original	FLAVOR	Atum	3	8	6.75
cmun7urqo001w14aa825ljft5	cmun7urqi001m14aa5u14up4a	Cheddar	FLAVOR	Atum	3	8	2.25
cmun7urqo001y14aab43bhgaw	cmun7urqi001m14aa5u14up4a	Cheddar Original	FLAVOR	Bacon	3	8	6.75
cmun7urqp002014aa9uzz116t	cmun7urqi001m14aa5u14up4a	Cheddar Original	FLAVOR	Água na Boca	2	8	4.5
\.


--
-- TOC entry 5069 (class 0 OID 18104)
-- Dependencies: 220
-- Data for Name: PizzaCategory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PizzaCategory" (id, name, "priceP", "priceM", "priceG", "priceGG") FROM stdin;
cmuh5aa0u0001vwoj2q36owxx	Tradicionais	30	40	50	60
cmuh5aa0w0002vwoj5a76bvh3	Especiais	35	45	55	65
cmuh5aa0x0003vwoj8vtdvwgm	Executivas	40	50	60	70
cmuh5aa0x0004vwojrlewed11	Premium	45	55	65	75
cmuh5aa0y0005vwojhgvg77sj	Doces	35	45	55	65
cmuh5aa0z0006vwojg1jgf0xj	Doces Premium	45	55	65	75
\.


--
-- TOC entry 5070 (class 0 OID 18111)
-- Dependencies: 221
-- Data for Name: PizzaFlavor; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PizzaFlavor" (id, name, description, "imageUrl", "pizzaCategoryId") FROM stdin;
cmuh5aa1u001ivwojaoeyxrj4	Lombo Cremoso	Mussarela, lombo canadense, requeijão, orégano e azeitona.	/uploads/sabor_lombo-cremoso.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa28002ivwojv5u78r07	Cheddar Original	Frango, mussarela, cheddar original, orégano e azeitona.	/images/flavors/cheddar-original.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa29002kvwojhwnpvd95	Bacon X	Mussarela, calabresa, bacon, cream cheese original, orégano e azeitona.	/images/flavors/bacon-x.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa19000avwoj16fm3pvf	Bauru	Mussarela, presunto, tomate, orégano e azeitona.	/uploads/sabor_bauru.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1m000yvwojodui7r5o	Baiana	Calabresa ralada, mussarela, ovo, pimenta, cebola, orégano e azeitona.	/uploads/sabor_baiana.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa26002avwojvnjva7r5	Saborosa	Mussarela, frango, cream cheese, bacon, milho, orégano e azeitona.	/uploads/sabor_saborosa.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa27002evwojvf0owbf4	Catupiry Original	Frango, mussarela, catupiry original, orégano e azeitona.	/uploads/sabor_catupiry-original.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa27002cvwojqf7rkwi3	Camarão	Mussarela, catupiry, camarão, cebola, orégano e azeitona.	/uploads/sabor_camarao.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa230020vwojq4m0j7b6	Mista	Mussarela, calabresa ralada, frango, requeijão, orégano e azeitona.	/uploads/sabor_mista.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa250026vwoj5dwe1q38	Portuguesa	Mussarela, presunto, milho, ervilha, ovo, tomate, cebola, orégano e azeitona.	/uploads/sabor_portuguesa.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1y001qvwoj466mho0g	Caipira	Mussarela, frango, milho, ovo, cebola, orégano e azeitona.	/uploads/sabor_caipira.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa22001yvwojbt49jvlc	Especial	Mussarela, presunto, frango, bacon, calabresa, orégano e azeitona.	/uploads/sabor_especial.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1r0018vwojj8kvg75y	Nordestina	Mussarela, frango, charque, ovo, cebola, orégano e azeitona.	/uploads/sabor_nordestina.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa21001wvwojny4gmy2v	Canadense	Lombo canadense, mussarela, bacon, cebola, orégano e azeitona.	/uploads/sabor_canadense.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1w001ovwojfj1qgaq7	Charque Cheese	Mussarela, charque, cream cheese, orégano e azeitona.	/uploads/sabor_charque-cheese.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa20001uvwoj1bqjkoxa	Campestre	Mussarela, bacon, ovo, milho, tomate, cebola, orégano e azeitona.	/uploads/sabor_campestre.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa28002gvwoj2r5f0xgj	Charque Top	Mussarela, charque, queijo coalho, cebola, orégano e azeitona.	/uploads/sabor_charque-top.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa1z001svwoj5ktbhno3	Calabresa Cheese	Calabresa, mussarela, cream cheese, orégano e azeitona.	/uploads/sabor_calabresa-cheese.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1s001cvwoj0jc6zajw	Frango Cheese	Mussarela, frango, cream cheese, orégano e azeitona.	/uploads/sabor_frango-cheese.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1t001evwojvg5b1qyw	Frango Bacon	Frango, mussarela, bacon, orégano e azeitona.	/uploads/sabor_frango-com-bacon.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa240024vwojk6v26vtq	Moda da Casa	Mussarela, catupiry, carne de sol, queijo coalho, cebola, orégano e azeitona.	/uploads/sabor_moda-da-casa.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1u001kvwoju3gax8ie	Peperone	Mussarela, peperone, cebola, orégano e azeitona.	/uploads/sabor_pepperoni.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1t001gvwojtin9y3un	Italiana	Mussarela, salaminho italiano, cebola, tomate, orégano e azeitona.	/uploads/sabor_italiana.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1o0012vwojxvt3om0s	Carne de Sol	Mussarela, carne de sol, queijo coalho, cebola, orégano e azeitona.	/uploads/sabor_carne-de-sol.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1q0016vwojbj2gm2ui	Calabresa Catupiry (ou) Cheddar	Mussarela, calabresa, catupiry ou cheddar, orégano e azeitona.	/uploads/sabor_calabresa-com-catupiry.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1p0014vwoj9snx2bjc	Calabresa	Mussarela, calabresa, cebola, orégano e azeitona.	/uploads/sabor_calabresa.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1n0010vwojcicvn0jc	Carne Seca	Mussarela, charque, catupiry, orégano e azeitona.	/uploads/sabor_carne-seca.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa230022vwojf6xxrisf	Moda do Cheff	Mussarela, calabresa ralada, charque, ovo, bacon, orégano e azeitona.	/uploads/sabor_a-moda-do-cheff.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1r001avwojiaj4ojry	Charque	Mussarela, charque, cebola, orégano e azeitona.	/uploads/sabor_charque.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1l000wvwojw75oqdtz	Bacon	Mussarela, bacon, ovo, cebola, orégano e azeitona.	/uploads/sabor_bacon.png	cmuh5aa0w0002vwoj5a76bvh3
cmuh5aa1h000qvwojm0mkotc8	Lombo	Mussarela, lombo canadense, cebola, orégano e azeitona.	/uploads/sabor_lombo.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1f000kvwojqpfwphkj	Milho Verde	Mussarela, milho verde, orégano e azeitona.	/uploads/sabor_milho-verde.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1e000ivwojln2ncych	Frango Catupiry	Frango, mussarela, catupiry, orégano e azeitona.	/uploads/sabor_frango-catupiry.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa100008vwojptnssllt	Atum	Mussarela, atum, cebola, orégano e azeitona.	/uploads/sabor_atum.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1v001mvwojd6e52xjk	Brasileira	Presunto, mussarela, charque, ovo, cebola, orégano e azeitona.	/uploads/sabor_brasileira.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1b000cvwojl0sx8i8r	Dois Queijos	Mussarela, catupiry, orégano e azeitona.	/uploads/sabor_dois-queijos.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1c000evwojgxu62j3n	Frango Cheddar	Frango, mussarela, cheddar, orégano e azeitona.	/uploads/sabor_frango-cheddar.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1d000gvwojbunjl4xd	Frango Mussarela	Frango, mussarela, tomate, orégano e azeitona.	/uploads/sabor_frango-mussarela.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1h000ovwoji5i9em90	Marguerita	Mussarela, tomate, parmesão, manjericão, orégano e azeitona.	/uploads/sabor_marguerita.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa1g000mvwoj8sf0zjia	Mussarela	Mussarela, tomate, orégano e azeitona.	/uploads/sabor_mussarela.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa260028vwojpux6w7aw	Quatro Queijos	Mussarela, catupiry, provolone, parmesão, orégano e azeitona.	/uploads/sabor_quatro-queijos.png	cmuh5aa0x0003vwoj8vtdvwgm
cmuh5aa1i000svwoj0g0xb9ea	Três Queijos	Mussarela, catupiry, parmesão, orégano e azeitona.	/uploads/sabor_tres-queijos.png	cmuh5aa0u0001vwoj2q36owxx
cmuh5aa29002mvwoj11to5ddl	Paulista	Calabresa ralada, mussarela, cheddar original, bacon, orégano e azeitona.	/images/flavors/paulista.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa2b002qvwojtq04ozq6	Frango X Original	Frango, mussarela, cream cheese original, orégano e azeitona.	/images/flavors/frango-x-original.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa2c002wvwojkxmf3vae	Banana com Canela	Mussarela, banana, canela, leite condensado.	/images/flavors/banana-com-canela.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa2f0036vwoj23kz21h5	Banana Nevada	Mussarela, banana, chocolate branco gratinado.	/images/flavors/banana-nevada.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2j003ivwojysa89qg7	Sonho de Valsa (ou) Ouro Branco	Mussarela, chocolate ao leite/branco, Sonho de Valsa/Ouro Branco.	/images/flavors/sonho-de-valsa--ou--ouro-branco.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2k003kvwoj143e9cjy	Tutti Frutti	Mussarela, chocolate ao leite, chocolate avelã, morango, uva, banana.	/images/flavors/tutti-frutti.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2k003mvwoj3onjpdu8	Uva dos Sonhos	Mussarela, chocolate ao leite, chocolate branco, uva.	/uploads/sabor_uvas-dos-sonhos.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2i003evwoj1rt9ahqs	Oreo	Mussarela, chocolate ao leite, Oreo, morango.	/uploads/sabor_oreo.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2h003cvwoj19m5d2je	Ninho com Nutella	Mussarela, Nutella, chocolate avelã, leite Ninho.	/uploads/sabor_ninho-nutella.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2g003avwojwyqcwjki	Nutella	Mussarela, Nutella, chocolate avelã, morango.	/uploads/sabor_nutella.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2g0038vwojqts71hjs	Cartola	Mussarela, banana, queijo coalho, chocolate branco.	/uploads/sabor_cartolla.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2e0032vwojjqiyqjh2	Prestígio	Mussarela, chocolate ao leite, coco ralado, M&M's.	/uploads/sabor_prestigio.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa2f0034vwojq7sv6w3q	KitKat	Mussarela, chocolate ao leite, KitKat, M&M's.	/uploads/sabor_kitkat.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2i003gvwojig9sco3b	Sensação Especial	Mussarela, chocolate ao leite, chocolate branco, morango, M&M's.	/uploads/sabor_seensacao-especial.png	cmuh5aa0z0006vwojg1jgf0xj
cmuh5aa2d002yvwojtmjc68ap	Sensação	Mussarela, chocolate branco, chocolate ao leite, M&M's.	/uploads/sabor_sensacao.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa2a002ovwojb8cljs6f	Peperone Bacon	Mussarela, peperone, bacon, cheddar original, orégano e azeitona.	/uploads/sabor_pepperoni-e-bacon.png	cmuh5aa0x0004vwojrlewed11
cmuh5aa2e0030vwojeuot6rz8	Romeu e Julieta	Mussarela, queijo coalho e goiabada.	/uploads/sabor_romeu-e-julieta.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa2b002svwoj613o5gk9	Brigadeiro	Mussarela, chocolate ao leite, granulado, M&M's.	/uploads/sabor_brigadeiro.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa2c002uvwojbboe18us	Bis	Mussarela, chocolate ao leite, Bis, M&M's.	/uploads/sabor_bizz.png	cmuh5aa0y0005vwojhgvg77sj
cmuh5aa1j000uvwojbp04eyf2	Água na Boca	Mussarela, milho, bacon, cebola, orégano e azeitona.	/uploads/sabor_agua-na-boca.png	cmuh5aa0w0002vwoj5a76bvh3
\.


--
-- TOC entry 5083 (class 0 OID 18894)
-- Dependencies: 234
-- Data for Name: PizzaTopping; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PizzaTopping" (id, name, "pricePM", "priceGGG", "isUnit", "categoryId", "createdAt", "updatedAt") FROM stdin;
cmuh5aa310049vwojta74jcvl	Azeitona	3	6	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.893	2026-09-25 15:58:02.893
cmuh5aa33004bvwojbh775d0s	Atum	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.895	2026-09-25 15:58:02.895
cmuh5aa34004dvwojxdexw4gv	Bacon	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.896	2026-09-25 15:58:02.896
cmuh5aa35004fvwoj20uxeuc5	Charque	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.897	2026-09-25 15:58:02.897
cmuh5aa36004hvwojffukptwq	Camarão	14	25	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.898	2026-09-25 15:58:02.898
cmuh5aa37004jvwojds2kmq36	Calabresa	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.899	2026-09-25 15:58:02.899
cmuh5aa37004lvwojejb5k1hg	Carne de Sol	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.9	2026-09-25 15:58:02.9
cmuh5aa38004nvwojvxnnno3u	Frango	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.9	2026-09-25 15:58:02.9
cmuh5aa39004pvwojnkrc4hcr	Lombo Canadense	8	15	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.901	2026-09-25 15:58:02.901
cmuh5aa39004rvwoj03e3p5z7	Presunto	7	12	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.902	2026-09-25 15:58:02.902
cmuh5aa3a004tvwoju2xif2x5	Queijo Coalho	7	12	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.902	2026-09-25 15:58:02.902
cmuh5aa3b004vvwojcbcjc3xu	Queijo Provolone	7	12	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.903	2026-09-25 15:58:02.903
cmuh5aa3b004xvwojilf3dsec	Mussarela	10	16	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.904	2026-09-25 15:58:02.904
cmuh5aa3c004zvwoj7z3mm8qo	Peperone	8	14	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.904	2026-09-25 15:58:02.904
cmuh5aa3c0051vwojbrwef9ki	Parmesão	8	14	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.905	2026-09-25 15:58:02.905
cmuh5aa3d0053vwojz9jiclla	Salaminho Italiano	8	14	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.905	2026-09-25 15:58:02.905
cmuh5aa3e0055vwojx9kczy0y	Tomate	2	4	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.906	2026-09-25 15:58:02.906
cmuh5aa3e0057vwoj2pgmuywc	Cebola	2	4	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.907	2026-09-25 15:58:02.907
cmuh5aa3f0059vwojy0mz3hqp	Ovo	3	5	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.907	2026-09-25 15:58:02.907
cmuh5aa3g005bvwojzylme1lf	Ervilha	3	5	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.908	2026-09-25 15:58:02.908
cmuh5aa3g005dvwojkfjy4rmd	Milho	3	5	f	cmuh5aa2z0047vwojga76hjp2	2026-09-25 15:58:02.909	2026-09-25 15:58:02.909
cmuh5aa3h005gvwojl6b9w6al	Catupiry	4	6	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.91	2026-09-25 15:58:02.91
cmuh5aa3i005ivwoj2pd0f2ua	Cheddar	4	6	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.91	2026-09-25 15:58:02.91
cmuh5aa3j005kvwojzqmb6b4z	Cream Cheese	9	14	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.911	2026-09-25 15:58:02.911
cmuh5aa3j005mvwojsyst9onk	Catupiry Original	11	18	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.912	2026-09-25 15:58:02.912
cmuh5aa3k005ovwojtzqxo9ul	Cheddar Original	11	18	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.912	2026-09-25 15:58:02.912
cmuh5aa3k005qvwojjcji29q8	Cream Cheese Original	11	18	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.913	2026-09-25 15:58:02.913
cmuh5aa3l005svwojznrfwlrf	Requeijão	7	10	f	cmuh5aa3h005evwojir1tth74	2026-09-25 15:58:02.913	2026-09-25 15:58:02.913
cmuh5aa3m005vvwoj5i9p6bez	Bis	4	8	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.914	2026-09-25 15:58:02.914
cmuh5aa3m005xvwojzaxab3wo	Chocolate Branco	8	12	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.915	2026-09-25 15:58:02.915
cmuh5aa3n005zvwojyyuwf8ax	Chocolate ao Leite	8	12	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.915	2026-09-25 15:58:02.915
cmuh5aa3n0061vwojob0g2z86	Chocolate Avelã	10	16	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.916	2026-09-25 15:58:02.916
cmuh5aa3o0063vwojkgojeb8q	Goiabada	6	10	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.916	2026-09-25 15:58:02.916
cmuh5aa3p0065vwojsffz3g0o	Granulado	4	8	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.917	2026-09-25 15:58:02.917
cmuh5aa3p0067vwoj6eknmc1d	M.&.M	6	10	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.918	2026-09-25 15:58:02.918
cmuh5aa3q0069vwojlq3oprm4	Nutella	10	16	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.918	2026-09-25 15:58:02.918
cmuh5aa3q006bvwoj772y3hfh	Sonho de Valsa (Unidade)	2	2	t	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.919	2026-09-25 15:58:02.919
cmuh5aa3r006dvwojxhz7xwy6	Ouro Branco (Unidade)	2	2	t	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.919	2026-09-25 15:58:02.919
cmuh5aa3s006fvwojcw0ceinf	Kit.Kat (Unidade)	6	6	t	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.92	2026-09-25 15:58:02.92
cmuh5aa3s006hvwojjgyreoj5	Cocô Ralado	6	10	f	cmuh5aa3l005tvwoj710xm7rb	2026-09-25 15:58:02.921	2026-09-25 15:58:02.921
cmuh5aa3t006kvwojme0on9wi	Morango	8	14	f	cmuh5aa3t006ivwoj953dpiii	2026-09-25 15:58:02.922	2026-09-25 15:58:02.922
cmuh5aa3u006mvwojb5pjh2hn	Banana	5	10	f	cmuh5aa3t006ivwoj953dpiii	2026-09-25 15:58:02.922	2026-09-25 15:58:02.922
cmuh5aa3u006ovwoj2nduy2q5	Uva	8	14	f	cmuh5aa3t006ivwoj953dpiii	2026-09-25 15:58:02.923	2026-09-25 15:58:02.923
\.


--
-- TOC entry 5082 (class 0 OID 18886)
-- Dependencies: 233
-- Data for Name: PizzaToppingCategory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PizzaToppingCategory" (id, name, "createdAt", "updatedAt") FROM stdin;
cmuh5aa2z0047vwojga76hjp2	INGREDIENTES	2026-09-25 15:58:02.891	2026-09-25 15:58:02.891
cmuh5aa3h005evwojir1tth74	CREMES	2026-09-25 15:58:02.909	2026-09-25 15:58:02.909
cmuh5aa3l005tvwoj710xm7rb	DOCES	2026-09-25 15:58:02.914	2026-09-25 15:58:02.914
cmuh5aa3t006ivwoj953dpiii	FRUTAS	2026-09-25 15:58:02.921	2026-09-25 15:58:02.921
\.


--
-- TOC entry 5067 (class 0 OID 18089)
-- Dependencies: 218
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, name, description, price, "imageUrl", "categoryId", "createdAt", "updatedAt") FROM stdin;
cmuh5aa2s003zvwojtwqwa9rp	Coca-Cola 2L	Refrigerante Coca-Cola Garrafa 2 Litros	10	/images/products/coca-cola-2l.png	cmuh5aa2s003xvwoj4f10xj8q	2026-09-25 15:58:02.885	2026-09-25 15:58:02.885
cmuh5aa2t0041vwoj0co7qzjf	Coca-Cola Lata	Refrigerante Coca-Cola Lata 350ml	5	/images/products/coca-cola-lata.png	cmuh5aa2s003xvwoj4f10xj8q	2026-09-25 15:58:02.886	2026-09-25 15:58:02.886
cmuh5aa2u0043vwojpqagr9wt	Guaraná Antártica 2L	Refrigerante Guaraná Garrafa 2 Litros	9	/images/products/guarana-2l.png	cmuh5aa2s003xvwoj4f10xj8q	2026-09-25 15:58:02.886	2026-09-25 15:58:02.886
cmuh5aa2v0045vwojx8ovfpqr	Água Mineral 500ml	Água mineral sem gás	3	/images/products/agua-500ml.png	cmuh5aa2s003xvwoj4f10xj8q	2026-09-25 15:58:02.887	2026-09-25 15:58:02.887
\.


--
-- TOC entry 5079 (class 0 OID 18851)
-- Dependencies: 230
-- Data for Name: SystemConfig; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SystemConfig" (key, value) FROM stdin;
delivery_open	true
company_name	Izaack Pizzaria
company_logo	
delivery_cities	Cachoeirinha
primary_color	#1cf20d
vroom_depot_lat	-8.488070
vroom_depot_lng	-36.237907
depotLat	-8.488070
depotLng	-36.237907
desktop_api_key	alldelivery_internal_print_secret
daily_comanda_payments_2026-09-29	[]
comanda_payments_cmtc015il000qfrt0agex4fy5	[{"id":"pay_1790872664619_e8rm","method":"DINHEIRO","amount":50,"changeFor":50,"troco":null,"notes":null,"createdAt":"2026-10-01T16:37:44.619Z"},{"id":"pay_1790872672677_sdxb","method":"DINHEIRO","amount":20,"changeFor":30,"troco":10,"notes":null,"createdAt":"2026-10-01T16:37:52.677Z"},{"id":"pay_1790872678972_e3mb","method":"DINHEIRO","amount":19,"changeFor":19,"troco":null,"notes":null,"createdAt":"2026-10-01T16:37:58.972Z"}]
daily_comanda_payments_2026-10-01	[{"id":"pay_1790872664619_e8rm","comandaId":"cmtc015il000qfrt0agex4fy5","comandaNumber":4,"responsibleName":null,"method":"DINHEIRO","amount":50,"changeFor":50,"troco":null,"createdAt":"2026-10-01T16:37:44.619Z"},{"id":"pay_1790872672677_sdxb","comandaId":"cmtc015il000qfrt0agex4fy5","comandaNumber":4,"responsibleName":null,"method":"DINHEIRO","amount":20,"changeFor":30,"troco":10,"createdAt":"2026-10-01T16:37:52.677Z"},{"id":"pay_1790872678972_e3mb","comandaId":"cmtc015il000qfrt0agex4fy5","comandaNumber":4,"responsibleName":null,"method":"DINHEIRO","amount":19,"changeFor":19,"troco":null,"createdAt":"2026-10-01T16:37:58.972Z"},{"id":"pay_1790876921379_5qmp","comandaId":"cmtc015ik000pfrt0gqkd53bx","comandaNumber":3,"responsibleName":null,"method":"PIX","amount":90,"changeFor":null,"troco":null,"createdAt":"2026-10-01T17:48:41.379Z"},{"id":"pay_1790876955927_6t7c","comandaId":"cmtc015ij000ofrt07xkkiozl","comandaNumber":2,"responsibleName":null,"method":"PIX","amount":63,"changeFor":null,"troco":null,"createdAt":"2026-10-01T17:49:15.927Z"},{"id":"pay_1790877724793_6vvw","comandaId":"cmtc015ih000nfrt0h54bj1pd","comandaNumber":1,"responsibleName":null,"method":"PIX","amount":50,"changeFor":null,"troco":null,"createdAt":"2026-10-01T18:02:04.793Z"},{"id":"pay_1790877724840_p6v4","comandaId":"cmtc015ih000nfrt0h54bj1pd","comandaNumber":1,"responsibleName":null,"method":"DINHEIRO","amount":30,"changeFor":null,"troco":null,"createdAt":"2026-10-01T18:02:04.840Z"}]
\.


--
-- TOC entry 5066 (class 0 OID 18036)
-- Dependencies: 217
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
d686441f-7b6c-4190-b1ff-85dfe0b5f582	6bcd476928a2cfc388b5e607cc615903733deadebe9f57d9ec2a43801f3855c0	2026-07-13 12:06:22.767754-03	20260713150622_init	\N	\N	2026-07-13 12:06:22.711427-03	1
7cfe6e0d-e7a3-440d-9a16-3b3f1a7c6230	de39ab1f0f62483b92d8a3c0ecc64f2f3de3ed26989c70a9959ab44bcd2efd70	2026-07-13 13:35:08.800724-03	20260713163508_add_system_config	\N	\N	2026-07-13 13:35:08.777564-03	1
\.


--
-- TOC entry 5093 (class 0 OID 0)
-- Dependencies: 223
-- Name: Order_orderNumber_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Order_orderNumber_seq"', 36, true);


--
-- TOC entry 4891 (class 2606 OID 18173)
-- Name: AdminUser AdminUser_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdminUser"
    ADD CONSTRAINT "AdminUser_pkey" PRIMARY KEY (id);


--
-- TOC entry 4860 (class 2606 OID 18103)
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- TOC entry 4911 (class 2606 OID 18935)
-- Name: Comanda Comanda_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Comanda"
    ADD CONSTRAINT "Comanda_pkey" PRIMARY KEY (id);


--
-- TOC entry 4895 (class 2606 OID 18182)
-- Name: CrustType CrustType_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CrustType"
    ADD CONSTRAINT "CrustType_pkey" PRIMARY KEY (id);


--
-- TOC entry 4888 (class 2606 OID 18164)
-- Name: CustomerContactProfile CustomerContactProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CustomerContactProfile"
    ADD CONSTRAINT "CustomerContactProfile_pkey" PRIMARY KEY (id);


--
-- TOC entry 4868 (class 2606 OID 18126)
-- Name: DeliveryZone DeliveryZone_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DeliveryZone"
    ADD CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY (id);


--
-- TOC entry 4899 (class 2606 OID 18866)
-- Name: DriverActiveRoute DriverActiveRoute_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DriverActiveRoute"
    ADD CONSTRAINT "DriverActiveRoute_pkey" PRIMARY KEY ("driverId");


--
-- TOC entry 4885 (class 2606 OID 18156)
-- Name: OrderItemFlavor OrderItemFlavor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItemFlavor"
    ADD CONSTRAINT "OrderItemFlavor_pkey" PRIMARY KEY (id);


--
-- TOC entry 4902 (class 2606 OID 18885)
-- Name: OrderItemTopping OrderItemTopping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItemTopping"
    ADD CONSTRAINT "OrderItemTopping_pkey" PRIMARY KEY (id);


--
-- TOC entry 4882 (class 2606 OID 18149)
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- TOC entry 4875 (class 2606 OID 18140)
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- TOC entry 4863 (class 2606 OID 18110)
-- Name: PizzaCategory PizzaCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaCategory"
    ADD CONSTRAINT "PizzaCategory_pkey" PRIMARY KEY (id);


--
-- TOC entry 4866 (class 2606 OID 18117)
-- Name: PizzaFlavor PizzaFlavor_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaFlavor"
    ADD CONSTRAINT "PizzaFlavor_pkey" PRIMARY KEY (id);


--
-- TOC entry 4905 (class 2606 OID 18893)
-- Name: PizzaToppingCategory PizzaToppingCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaToppingCategory"
    ADD CONSTRAINT "PizzaToppingCategory_pkey" PRIMARY KEY (id);


--
-- TOC entry 4908 (class 2606 OID 18902)
-- Name: PizzaTopping PizzaTopping_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaTopping"
    ADD CONSTRAINT "PizzaTopping_pkey" PRIMARY KEY (id);


--
-- TOC entry 4857 (class 2606 OID 18096)
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- TOC entry 4897 (class 2606 OID 18857)
-- Name: SystemConfig SystemConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SystemConfig"
    ADD CONSTRAINT "SystemConfig_pkey" PRIMARY KEY (key);


--
-- TOC entry 4854 (class 2606 OID 18044)
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- TOC entry 4889 (class 1259 OID 18187)
-- Name: AdminUser_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "AdminUser_email_key" ON public."AdminUser" USING btree (email);


--
-- TOC entry 4892 (class 1259 OID 35261)
-- Name: AdminUser_role_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AdminUser_role_active_idx" ON public."AdminUser" USING btree (role, active);


--
-- TOC entry 4858 (class 1259 OID 18183)
-- Name: Category_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_name_key" ON public."Category" USING btree (name);


--
-- TOC entry 4909 (class 1259 OID 18936)
-- Name: Comanda_number_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Comanda_number_key" ON public."Comanda" USING btree (number);


--
-- TOC entry 4893 (class 1259 OID 18188)
-- Name: CrustType_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CrustType_name_key" ON public."CrustType" USING btree (name);


--
-- TOC entry 4886 (class 1259 OID 18186)
-- Name: CustomerContactProfile_phoneKey_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CustomerContactProfile_phoneKey_key" ON public."CustomerContactProfile" USING btree ("phoneKey");


--
-- TOC entry 4883 (class 1259 OID 35268)
-- Name: OrderItemFlavor_orderItemId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderItemFlavor_orderItemId_idx" ON public."OrderItemFlavor" USING btree ("orderItemId");


--
-- TOC entry 4900 (class 1259 OID 35269)
-- Name: OrderItemTopping_orderItemId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderItemTopping_orderItemId_idx" ON public."OrderItemTopping" USING btree ("orderItemId");


--
-- TOC entry 4880 (class 1259 OID 35267)
-- Name: OrderItem_orderId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OrderItem_orderId_idx" ON public."OrderItem" USING btree ("orderId");


--
-- TOC entry 4869 (class 1259 OID 35263)
-- Name: Order_comandaId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_comandaId_idx" ON public."Order" USING btree ("comandaId");


--
-- TOC entry 4870 (class 1259 OID 27071)
-- Name: Order_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_createdAt_idx" ON public."Order" USING btree ("createdAt");


--
-- TOC entry 4871 (class 1259 OID 27069)
-- Name: Order_customerPhone_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_customerPhone_idx" ON public."Order" USING btree ("customerPhone");


--
-- TOC entry 4872 (class 1259 OID 35262)
-- Name: Order_driverId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_driverId_idx" ON public."Order" USING btree ("driverId");


--
-- TOC entry 4873 (class 1259 OID 18185)
-- Name: Order_orderNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Order_orderNumber_key" ON public."Order" USING btree ("orderNumber");


--
-- TOC entry 4876 (class 1259 OID 35265)
-- Name: Order_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_status_createdAt_idx" ON public."Order" USING btree (status, "createdAt");


--
-- TOC entry 4877 (class 1259 OID 27070)
-- Name: Order_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_status_idx" ON public."Order" USING btree (status);


--
-- TOC entry 4878 (class 1259 OID 35264)
-- Name: Order_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_type_idx" ON public."Order" USING btree (type);


--
-- TOC entry 4879 (class 1259 OID 35266)
-- Name: Order_type_status_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Order_type_status_createdAt_idx" ON public."Order" USING btree (type, status, "createdAt");


--
-- TOC entry 4861 (class 1259 OID 18184)
-- Name: PizzaCategory_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PizzaCategory_name_key" ON public."PizzaCategory" USING btree (name);


--
-- TOC entry 4864 (class 1259 OID 35270)
-- Name: PizzaFlavor_pizzaCategoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PizzaFlavor_pizzaCategoryId_idx" ON public."PizzaFlavor" USING btree ("pizzaCategoryId");


--
-- TOC entry 4903 (class 1259 OID 18903)
-- Name: PizzaToppingCategory_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PizzaToppingCategory_name_key" ON public."PizzaToppingCategory" USING btree (name);


--
-- TOC entry 4906 (class 1259 OID 35271)
-- Name: PizzaTopping_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PizzaTopping_categoryId_idx" ON public."PizzaTopping" USING btree ("categoryId");


--
-- TOC entry 4855 (class 1259 OID 35272)
-- Name: Product_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_categoryId_idx" ON public."Product" USING btree ("categoryId");


--
-- TOC entry 4918 (class 2606 OID 18872)
-- Name: DriverActiveRoute DriverActiveRoute_driverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."DriverActiveRoute"
    ADD CONSTRAINT "DriverActiveRoute_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."AdminUser"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4917 (class 2606 OID 18204)
-- Name: OrderItemFlavor OrderItemFlavor_orderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItemFlavor"
    ADD CONSTRAINT "OrderItemFlavor_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4919 (class 2606 OID 18904)
-- Name: OrderItemTopping OrderItemTopping_orderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItemTopping"
    ADD CONSTRAINT "OrderItemTopping_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4916 (class 2606 OID 18199)
-- Name: OrderItem OrderItem_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4914 (class 2606 OID 18937)
-- Name: Order Order_comandaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES public."Comanda"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 4915 (class 2606 OID 18867)
-- Name: Order Order_driverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES public."AdminUser"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 4913 (class 2606 OID 18194)
-- Name: PizzaFlavor PizzaFlavor_pizzaCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaFlavor"
    ADD CONSTRAINT "PizzaFlavor_pizzaCategoryId_fkey" FOREIGN KEY ("pizzaCategoryId") REFERENCES public."PizzaCategory"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 4920 (class 2606 OID 18909)
-- Name: PizzaTopping PizzaTopping_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PizzaTopping"
    ADD CONSTRAINT "PizzaTopping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."PizzaToppingCategory"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4912 (class 2606 OID 18189)
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- TOC entry 5091 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


-- Completed on 2026-10-06 14:16:41

--
-- PostgreSQL database dump complete
--

\unrestrict vVT6f8XzmWRQDblFEfhJEd9gwMxAGpg9OkcQ31rqSce7qVWDfBm4cAA2mhUhGGy

