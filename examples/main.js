import * as THREE from 'three';

        import Stats from 'three/addons/libs/stats.module.js';
        import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
        import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
        import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
        import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
        import { Audio, AudioListener, AudioLoader } from 'three';
        import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
        import {CylinderGeometry} from 'three/addons/geometries/CylinderGeometry.js';

        const manager = new THREE.LoadingManager();

        let camera, scene, renderer, stats, loader, guiMorphsFolder, controls;
        
        let player = createCharacterData();
        let enemy = createCharacterData();
        let allClips = {}; 

        let keysPressed = {}; 

        // Variables de Cámara
        let cameraMode = 1; // 1: Combate Elevada, 2: Libre

        let gameStarted = false;

        // Variables de Audio Global
        let punchSound;

        // placeholders de selección
        let playerIndex = 0;
        let enemyIndex = 0;
        

        // --- AJUSTES DE CÁMARA (Para igualar tu imagen) ---
        let camDistMode1 = 280; // Más lejos del jugador
        const minCamDist1 = 150;
        const maxCamDist1 = 500;
        const camHeightMode1 = 350; // Mucho más alta (vista desde arriba)
        
        // Vectores para suavizar la cámara
        const idealLookAt = new THREE.Vector3();
        const idealPos = new THREE.Vector3();
        const currentLookAt = new THREE.Vector3(0, 90, 0);

        const timer = new THREE.Timer();
        timer.connect( document );

        const params = { asset: 'mixamo' };
        const assets = [ 'mixamo' ];

        const stepDistances = {
            shortForward: 35, shortBackward: 30, shortLeft: 28, shortRight: 28,
            mediumForward: 70, mediumBackward: 60, mediumLeft: 55, mediumRight: 55
        };

        const enemyPunches = [
            'leadJab',
            'leadJab',
            'jabCross',
            'jabCross',
            'hook',
            'bodyJabCross',
            'leadJabShift',
            'uppercut',
            'hookShift',
            'bodyJabCrossShift'
        ];

        // Mapeo de tipos de golpes para saber qué animación de reacción usar
        const punchTypes = {
            'leadJab': 'body',
            'jabCross': 'head',
            'hook': 'body',
            'bodyJabCross': 'body',
            'leadJabShift': 'body',
            'uppercut': 'head',
            'hookShift': 'body',
            'bodyJabCrossShift': 'body'
        };

        function createCharacterData() {
            return {
                model: null,
                mixer: null,
                actions: {},
                activeAction: null,
                isMoving: false,
                moveData: null,

                comboQueue: [],
                isComboing: false,
                nextAttackTime: 0,
                
                // Variables de Colisiones e Impactos
                isHit: false,
                currentPunch: null,
                hasHit: false
            };
        }

        init();

        function init() {

            const fightBtn = document.getElementById('fightBtn');

            // Deshabilitar por seguridad
            fightBtn.disabled = true;
            fightBtn.textContent = "Cargando...";

            // ✅ Cuando TODO termine de cargar
            manager.onLoad = () => {
                console.log("Todo cargado");

                fightBtn.disabled = false;
                fightBtn.textContent = "Luchar";
            };

            const container = document.createElement( 'div' );
            document.body.appendChild( container );

            //=================================================
            // Camara
            //=================================================
            camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 2000 );
            camera.position.set( 0, 350, 500 ); 

            scene = new THREE.Scene();
            scene.background = new THREE.Color( 0xa0a0a0 );
            //scene.fog = new THREE.Fog( 0xa0a0a0, 200, 1000 );

            //=================================================
            // Luz (Reflector Principal)
            //=================================================
            const light = new THREE.SpotLight(0xffffff, 300); // Mayor intensidad
            light.position.set(0, 500, 0); // ¡La subimos al techo! (Antes estaba en 100)
            light.angle = Math.PI / 3; // Apertura del cono de luz
            light.penumbra = 0.5; // Suaviza los bordes de la luz

            light.castShadow = true;

            // Resolución de la sombra (2048 para que sea súper nítida)
            light.shadow.mapSize.width = 2048;
            light.shadow.mapSize.height = 2048;

            light.shadow.camera.near = 50;
            light.shadow.camera.far = 1000; // Necesita más distancia porque la luz está más alta
            light.shadow.bias = -0.0005; // Ayuda a que la sombra se pegue bien a los pies

            light.target.position.set(0, 0, 0);

            scene.add(light);
            scene.add(light.target);

            //=================================================
            // Sombra
            //=================================================
            scene.traverse(function (obj) {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });

            //=================================================
            // Entorno
            //=================================================
            const hdrLoader = new HDRLoader();
            hdrLoader.load('entorno/wrestling_gym_8k.hdr', function (texture) {
                texture.mapping = THREE.EquirectangularReflectionMapping;
                scene.background = texture;
                scene.environment = texture;
            });

            
            //=================================================
            // Audio
            //=================================================
            // 1. Crear listener
            const listener = new AudioListener();
            camera.add(listener);

            // 2. Crear audioLoader
            const audioLoader = new AudioLoader(); 

            // 3. Crear sound (Para la música de fondo)
            const sound = new Audio(listener);
            
            audioLoader.load('audio/Burning_Heart.mpeg', function (buffer) {
                console.log("Audio cargado exitosamente");
                sound.setBuffer(buffer);
                sound.setLoop(true);
                sound.setVolume(0.5);
                sound.play();
            });

            // 4. Crear sonido de campana (Para efectos especiales)
            const bellSound = new Audio(listener);
            audioLoader.load('audio/campana.mpeg', function (buffer) {
                console.log("Campana cargada exitosamente");
                bellSound.setBuffer(buffer);
                bellSound.setLoop(false); // Solo suena una vez
                bellSound.setVolume(0.9); // Un poco más fuerte para que destaque
            });

            // 5. Crear sonido de impacto
            punchSound = new Audio(listener);
            audioLoader.load('audio/golpe.mpeg', function (buffer) {
                punchSound.setBuffer(buffer);
                punchSound.setLoop(false);
                punchSound.setVolume(1.8);
            });

            // =====================================================
            // ACTIVAR AUDIO CON INTERACCIÓN (OBLIGATORIO EN NAVEGADORES)
            // =====================================================
            window.addEventListener('click', () => {
                if (!sound.isPlaying && sound.buffer) {
                    sound.play();
                    console.log("Audio iniciado correctamente");
                }
            });

            // =====================================================
            // ACTIVAR AUDIO CON INTERACCIÓN (OBLIGATORIO EN NAVEGADORES)
            // =====================================================
            window.addEventListener('click', () => {
                if (!sound.isPlaying && sound.buffer) {
                    sound.play();
                    console.log("Audio iniciado correctamente");
                }
            });

            //=================================================
            // Ring con textura de lona
            //=================================================
            // Creamos el cargador aquí mismo antes de usarlo
            const ringTextureLoader = new THREE.TextureLoader(manager);
            
            // Cargamos la textura con la extensión .jpg correcta
            const lonaTexture = ringTextureLoader.load('models/textures/lona.jpg');
            
            // Configuramos la repetición para que el tejido de la lona se vea fino
            lonaTexture.wrapS = THREE.RepeatWrapping;
            lonaTexture.wrapT = THREE.RepeatWrapping;
            lonaTexture.repeat.set(4, 4); 

            const ringSize = 800;
            const ringHeight = 40;
            
            const ringMaterial = new THREE.MeshStandardMaterial({ 
                map: lonaTexture,
                color: 0xffffff, 
                roughness: 0.4,  // REDUCIDO: Mientras más cerca a 0, más refleja la luz
                metalness: 0.1   // Le da un ligero toque satinado
            });

            const ring = new THREE.Mesh(
                new RoundedBoxGeometry(ringSize, ringHeight, ringSize, 10, 2, 10),
                ringMaterial
            );

            ring.position.y = ringHeight / 2;
            ring.receiveShadow = true; 
            scene.add(ring);


            // =================================================
            // Logo en el centro de la lona (Con Aspect Ratio)
            // =================================================
            const textureLoader = new THREE.TextureLoader(manager);
            textureLoader.load('models/textures/logo_itp.png', function(texture) {
                texture.colorSpace = THREE.SRGBColorSpace;
                
                // 1. Obtenemos las dimensiones originales de la imagen
                const imgWidth = texture.image.width;
                const imgHeight = texture.image.height;
                const aspectRatio = imgWidth / imgHeight;

                // 2. Definimos el tamaño deseado (lo subí a 400 para que se vea más grande)
                const targetSize = 400; 
                let planeWidth, planeHeight;

                // 3. Calculamos el ancho y alto final respetando la proporción original
                if (aspectRatio > 1) {
                    // Si es más ancha que alta
                    planeWidth = targetSize;
                    planeHeight = targetSize / aspectRatio;
                } else {
                    // Si es más alta que ancha, o cuadrada
                    planeHeight = targetSize;
                    planeWidth = targetSize * aspectRatio;
                }

                // 4. Creamos el plano con las medidas correctas
                const logoMesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(planeWidth, planeHeight),
                    new THREE.MeshStandardMaterial({
                        map: texture,
                        transparent: true, 
                        roughness: 0.9,    
                        metalness: 0.0,
                        depthWrite: false  
                    })
                );

                logoMesh.rotation.x = -Math.PI / 2;
                logoMesh.position.set(0, ringHeight + 0.1, 0);
                logoMesh.receiveShadow = true;
                scene.add(logoMesh);
            });
            
            // =================================================
            // Postes                                                   
            //=================================================
            const postHeight = 120;
            const postData = [ 
                { x: 350, z: 350, color: 0xad0202 }, // rojo 
                { x: -350, z: 350, color: 0xc7c5c5 }, // blanco 
                { x: -350, z: -350, color: 0x004aab }, // azul 
                { x: 350, z: -350, color: 0xc7c5c5 } // blanco 
            ];

            postData.forEach(p => {

                const material = new THREE.MeshStandardMaterial({
                    color: p.color,
                    roughness: 0.35,
                    metalness: 0.7
                });

                const post = new THREE.Mesh(
                    new THREE.CylinderGeometry(10, 10, postHeight, 32),
                    material
                );

                post.castShadow = true;
                post.receiveShadow = true;

                post.position.set(p.x, postHeight / 2 + ringHeight, p.z);

                scene.add(post);
            });

            //=================================================
            // Cuerdas con textura
            //=================================================
            const ropeTexture = textureLoader.load('models/textures/cuerda.jpg');
            
            // Configuramos la repetición para que no se estire la imagen
            ropeTexture.wrapS = THREE.RepeatWrapping;
            ropeTexture.wrapT = THREE.RepeatWrapping;
            
            // Ajusta el segundo número (20) para que el trenzado se vea más o menos tupido
            ropeTexture.repeat.set(1, 20); 

            const ropeMaterial = new THREE.MeshStandardMaterial({ 
                map: ropeTexture,
                color: 0xffffff, // Mantener en blanco para no teñir la textura
                roughness: 0.8,  // Más rugoso para que parezca tela o soga
                metalness: 0.0
            });

            const ropeLength = 700;

            [60, 80, 100].forEach(h => {

                // Frente
                const rope = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.5, 1.5, ropeLength, 16),
                    ropeMaterial
                );

                rope.rotation.z = Math.PI / 2;
                rope.position.set(0, h + ringHeight, 350);
                rope.castShadow = true; // Añadimos sombras para más profundidad
                rope.receiveShadow = true;

                scene.add(rope);

                // Atrás
                const back = rope.clone();
                back.position.z = -350;
                scene.add(back);

                // Izquierda
                const ropeSide = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.5, 1.5, ropeLength, 16),
                    ropeMaterial
                );

                ropeSide.rotation.x = Math.PI / 2;
                ropeSide.position.set(-350, h + ringHeight, 0);
                ropeSide.castShadow = true;
                ropeSide.receiveShadow = true;

                scene.add(ropeSide);

                // Derecha
                const right = ropeSide.clone();
                right.position.x = 350;
                scene.add(right);
            });

            //=================================================

            loader = new FBXLoader( manager );

            renderer = new THREE.WebGLRenderer( { antialias: true } );
            renderer.setPixelRatio( window.devicePixelRatio );
            renderer.setSize( window.innerWidth, window.innerHeight );
            renderer.setAnimationLoop( animate );
            renderer.shadowMap.enabled = true;
            container.appendChild( renderer.domElement );

            controls = new OrbitControls( camera, renderer.domElement );
            controls.enablePan = false; 
            controls.minDistance = 150; 
            controls.maxDistance = 600; 
            controls.maxPolarAngle = Math.PI / 2 - 0.05; 
            controls.enabled = false; 

            window.addEventListener( 'resize', onWindowResize );
            window.addEventListener( 'keydown', onKeyDown );
            window.addEventListener( 'keyup', onKeyUp );
            
            window.addEventListener( 'wheel', onMouseWheel );

            stats = new Stats();
            container.appendChild( stats.dom );

            const gui = new GUI();
            gui.add( params, 'asset', assets ).onChange( function ( value ) {
                loadAsset( value );
            } );

            guiMorphsFolder = gui.addFolder( 'Morphs' ).hide();

            loadAsset( params.asset );

            // ============================
            // UI MENU
            // ============================

            const overlay = document.getElementById('menuOverlay');

            // botones (placeholders)
            document.getElementById('playerPrev').onclick = () => {
                playerIndex--;
                console.log("Player index:", playerIndex);
            };

            document.getElementById('playerNext').onclick = () => {
                playerIndex++;
                console.log("Player index:", playerIndex);
            };

            document.getElementById('enemyPrev').onclick = () => {
                enemyIndex--;
                console.log("Enemy index:", enemyIndex);
            };

            document.getElementById('enemyNext').onclick = () => {
                enemyIndex++;
                console.log("Enemy index:", enemyIndex);
            };

            // ============================
            // BOTÓN LUCHAR
            // ============================

            fightBtn.addEventListener('click', () => {

                // ocultar overlay
                overlay.style.display = 'none';

                // activar juego
                gameStarted = true;

                // 🔔 Reproducir campana inmediatamente al iniciar
                if (bellSound.buffer && !bellSound.isPlaying) {
                    bellSound.play();
                }

                // cambiar música de fondo
                audioLoader.load('audio/Fanfare.mpeg', function(buffer) {
                    sound.stop(); // detener la anterior
                    sound.setBuffer(buffer);
                    sound.setLoop(true);
                    sound.setVolume(0.4); // Le bajé un poco el volumen para no opacar la campana
                    sound.play();
                });

            });

        }

        function loadAsset( asset ) {

            if ( player.model ) scene.remove( player.model );
            if ( enemy.model ) scene.remove( enemy.model );

            player = createCharacterData();
            enemy = createCharacterData();
            allClips = {};
            keysPressed = {};

            guiMorphsFolder.children.forEach( ( child ) => child.destroy() );
            guiMorphsFolder.hide();

            loader.load( 'models/fbx/' + asset + '.fbx', function ( groupPlayer ) {
                
                setupModelMaterials(groupPlayer);
                player.model = groupPlayer;
                player.model.position.set( 0, 40, 120 ); 
                player.mixer = new THREE.AnimationMixer( player.model );
                scene.add( player.model );

                loader.load( 'models/fbx/' + asset + '.fbx', function ( groupEnemy ) {
                    
                    setupModelMaterials(groupEnemy, true); 
                    enemy.model = groupEnemy;
                    enemy.model.position.set( 0, 40, -120 ); 
                    enemy.mixer = new THREE.AnimationMixer( enemy.model );
                    scene.add( enemy.model );

                    setupMorphTargets(player.model);
                    loadAllAnimations();
                });
            });
        }

        function setupModelMaterials(model, makeBlue = false) {
            // Creamos el cargador de texturas
            const skinLoader = new THREE.TextureLoader(manager);
            
            // Elegimos la ruta según si es el jugador o el oponente
            const texturePath = makeBlue 
                ? 'models/textures/rockyy3121i21.png'  // Textura del Oponente
                : 'models/textures/rockyy3121bal.png'; // Textura del Jugador

            const characterTexture = skinLoader.load(texturePath);
            characterTexture.colorSpace = THREE.SRGBColorSpace;

            model.traverse( function ( child ) {
                if ( child.isSkinnedMesh ) child.skeleton.dispose();
                if ( child.geometry ) child.geometry.dispose();

                if ( child.isMesh ) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if ( child.material ) {
                        // Función interna para configurar el material con la textura
                        const configureMaterial = (m) => {
                            const newMat = m.clone();
                            newMat.map = characterTexture; // Aplicamos la skin mapeada
                            newMat.color.setHex(0xffffff);  // Ponemos el color en blanco para que la textura se vea original
                            newMat.roughness = 0.3;         // Mantenemos el efecto de brillo/sudor
                            newMat.metalness = 0.1;
                            return newMat;
                        };

                        if ( Array.isArray( child.material ) ) {
                            child.material = child.material.map( m => configureMaterial(m) );
                        } else {
                            child.material = configureMaterial(child.material);
                        }
                    }
                }
            } );
        }

        function setupMorphTargets(model) {
            model.traverse( function ( child ) {
                if ( child.isMesh && child.morphTargetDictionary ) {
                    guiMorphsFolder.show();
                    const meshFolder = guiMorphsFolder.addFolder( child.name || child.uuid );
                    Object.keys( child.morphTargetDictionary ).forEach( ( key ) => {
                        meshFolder.add( child.morphTargetInfluences, child.morphTargetDictionary[ key ], 0, 1, 0.01 );
                    } );
                }
            });
        }

        function removeRootMotionXZ( clip ) {
            const newTracks = clip.tracks.map( function ( track ) {
                if ( track.name.includes( 'Hips.position' ) || track.name.includes( 'mixamorigHips.position' ) ) {
                    const newValues = track.values.slice();
                    const baseX = newValues[ 0 ];
                    const baseZ = newValues[ 2 ];
                    for ( let i = 0; i < newValues.length; i += 3 ) {
                        newValues[ i ] = baseX;      
                        newValues[ i + 2 ] = baseZ;   
                    }
                    return new THREE.VectorKeyframeTrack( track.name, track.times, newValues );
                }
                return track;
            } );
            return new THREE.AnimationClip( clip.name + '_NoRootMotionXZ', clip.duration, newTracks );
        }

        function loadAllAnimations() {

            const animationLoader = new FBXLoader( manager );

            const animations = {
                readyIdle: 'Ready Idle',
                standingToFight: 'Standing Idle To Fight Idle',
                fightIdle: 'Bouncing Fight Idle',

                shortForward: 'Short Step Forward',
                shortBackward: 'Short Step Backward',
                shortLeft: 'Short Left Side Step',
                shortRight: 'Short Right Side Step',

                mediumForward: 'Long Step Forward',
                mediumBackward: 'Long Step Backward',
                mediumLeft: 'Long Left Side Step',
                mediumRight: 'Long Right Side Step',

                leadJab: 'Lead Jab',
                jabCross: 'Jab Cross',
                hook: 'Hook',
                bodyJabCross: 'Body Jab Cross',

                leadJabShift: 'Lead Jab Shift',
                uppercut: 'Uppercut',
                hookShift: 'Hook Shift',
                bodyJabCrossShift: 'Body Jab Cross Shift',

                // Animaciones de Reacción
                hitBody: 'Hit To Body',
                hitHead: 'Big Hit To Head'
            };

            let loadedCount = 0;
            const totalAnimations = Object.keys( animations ).length;

            for ( const name in animations ) {
                animationLoader.load( 'models/fbx/' + animations[ name ] + '.fbx', function ( animGroup ) {

                    let clip = animGroup.animations[ 0 ];
                    if ( name.includes('short') || name.includes('medium') ) {
                        clip = removeRootMotionXZ( clip );
                    }
                    allClips[name] = clip;
                    loadedCount++;

                    if ( loadedCount === totalAnimations ) {
                        bindAnimations(player);
                        bindAnimations(enemy);

                        playReadyIdle(player);
                        playReadyIdle(enemy);
                    }


                    if ( ! animGroup.animations || animGroup.animations.length === 0 ) {
                        console.warn( 'El archivo no trae animación:', animations[ name ] );
                        return;
                    }
                } );
            }
        }

        function bindAnimations(character) {
            
            for (const name in allClips) {
                const action = character.mixer.clipAction(allClips[name]);
                if ( name === 'readyIdle' || name === 'fightIdle' ) {
                    action.setLoop( THREE.LoopRepeat );
                } else {
                    action.setLoop( THREE.LoopOnce );
                    action.clampWhenFinished = true;
                }
                action.enabled = true;
                character.actions[name] = action;
            }

            character.mixer.addEventListener( 'finished', function ( event ) {

                if ( event.action === character.actions.readyIdle ) return;
                if ( event.action === character.actions.fightIdle ) return;

                // Limpiar estado de golpe al terminar cualquier animación
                character.currentPunch = null;
                character.hasHit = false;
                character.moveData = null;

                // Si acaba de terminar de reaccionar a un golpe, vuelve al idle
                if (character.isHit) {
                    character.isHit = false;
                    playFightIdle(character);
                    return;
                }

                if ( character.isComboing ) {

                    playNextComboAction( character );
                    return;

                }

                character.isMoving = false;

                if ( character === player ) {

                    checkAndPlayMovement();

                } else {

                    playFightIdle( character );

                }

            } );
        }

        function switchAction( character, nextAction, fadeDuration = 0.35 ) {
            if ( ! nextAction ) return;
            const previousAction = character.activeAction;

            if ( previousAction === nextAction ) {
                nextAction.reset().play();
            } else {
                nextAction.reset().fadeIn( fadeDuration ).play();
                if ( previousAction ) previousAction.crossFadeTo( nextAction, fadeDuration, false );
            }
            character.activeAction = nextAction;
        }

        function playReadyIdle(character) {
            const idle = character.actions.readyIdle;
            if ( ! idle ) return;
            switchAction( character, idle, 0.4 );

            setTimeout( function () {
                if ( character.activeAction === idle ) playIntroToFight(character);
            }, 1200 );
        }

        function playIntroToFight(character) {
            const intro = character.actions.standingToFight;
            if ( ! intro ) return;
            switchAction( character, intro, 0.55 );
        }

        function playFightIdle(character) {
            const idle = character.actions.fightIdle;
            if ( ! idle || character.activeAction === idle ) return; 

            switchAction( character, idle, 0.45 );
            character.isMoving = false;
            character.moveData = null;
        }

        function playBoxAction( character, name ) {
            if ( character.isMoving || character.isHit ) return;
            if ( ! character.actions[ name ] ) return;

            character.isMoving = true;
            const action = character.actions[ name ];

            switchAction( character, action, 0.2 );
            startStepMovement( character, name, action );
        }

        function playPunchAction( character, name ) {

            if ( character.isMoving || character.isHit ) return;
            if ( ! character.actions[ name ] ) return;

            character.isMoving = true;
            character.currentPunch = name; // Registramos el ataque
            character.hasHit = false;      // Aún no impacta

            const action = character.actions[ name ];

            switchAction( character, action, 0.15 );

        }

        function startEnemyCombo() {

            if ( enemy.isMoving || enemy.isComboing || enemy.isHit ) return;

            const comboLength = THREE.MathUtils.randInt( 1, 4 );

            enemy.comboQueue = [];

            for ( let i = 0; i < comboLength; i++ ) {

                const randomPunch = enemyPunches[
                    Math.floor( Math.random() * enemyPunches.length )
                ];

                enemy.comboQueue.push( randomPunch );

            }

            enemy.isComboing = true;

            playNextComboAction( enemy );

        }

        function playNextComboAction( character ) {

            if ( character.comboQueue.length === 0 ) {

                character.isComboing = false;
                character.isMoving = false;
                playFightIdle( character );
                return;

            }

            const actionName = character.comboQueue.shift();
            const action = character.actions[ actionName ];

            if ( ! action ) {
                playNextComboAction( character );
                return;
            }

            character.isMoving = true;
            character.currentPunch = actionName;
            character.hasHit = false;

            switchAction( character, action, 0.12 );

        }


        function startStepMovement( character, name, action ) {
            const distance = stepDistances[ name ];
            if ( ! distance ) return;

            const direction = new THREE.Vector3();

            switch ( name ) {
                case 'shortForward':
                case 'mediumForward':
                    direction.set( 0, 0, 1 ); 
                    break;
                case 'shortBackward':
                case 'mediumBackward':
                    direction.set( 0, 0, -1 ); 
                    break;
                case 'shortLeft':
                case 'mediumLeft':
                    direction.set( 1, 0, 0 ); 
                    break;
                case 'shortRight':
                case 'mediumRight':
                    direction.set( -1, 0, 0 ); 
                    break;
            }

            character.moveData = {
                direction: direction,
                distance: distance,
                duration: action.getClip().duration,
                elapsed: 0
            };
        }

        function updateStepMovement( character, delta ) {

            if ( !character.model || !character.moveData || character.isHit ) return;

            character.moveData.elapsed += delta;

            const speed = character.moveData.distance / character.moveData.duration;

            // Movimiento
            character.model.translateX( character.moveData.direction.x * speed * delta );
            character.model.translateZ( character.moveData.direction.z * speed * delta );

            // =============================
            // LIMITES DEL RING (AJUSTADO)
            // =============================
            const characterRadius = 40;   // radio físico del personaje
            const visualMargin = 10;      // margen extra por animación

            const ringHalf = 350;
            const limit = ringHalf - characterRadius - visualMargin;

            // Limitar movimiento
            character.model.position.x = Math.max(-limit, Math.min(limit, character.model.position.x));
            character.model.position.z = Math.max(-limit, Math.min(limit, character.model.position.z));


            // =============================
            // COLISION CON POSTES (MEJORADA)
            // =============================
            const postRadius = 10; // radio real del poste
            const safeDistance = characterRadius + postRadius;

            const postPositions = [
                { x: 350, z: 350 },
                { x: -350, z: 350 },
                { x: -350, z: -350 },
                { x: 350, z: -350 }
            ];

            postPositions.forEach(p => {

                const dx = character.model.position.x - p.x;
                const dz = character.model.position.z - p.z;

                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < safeDistance) {

                    const angle = Math.atan2(dz, dx);

                    character.model.position.x = p.x + Math.cos(angle) * safeDistance;
                    character.model.position.z = p.z + Math.sin(angle) * safeDistance;
                }

            });


            // Fin del movimiento
            if ( character.moveData.elapsed >= character.moveData.duration ) {
                character.moveData = null;
            }
        }

        // =====================================================
        // LÓGICA DE COLISIONES DE CUERPOS
        // =====================================================
        function resolveBodyCollisions() {
            if (!player.model || !enemy.model) return;
            const dist = player.model.position.distanceTo(enemy.model.position);
            const minDist = 65; // Suma de los radios físicos para evitar que se fusionen

            if (dist < minDist) {
                const overlap = minDist - dist;
                // Obtenemos el vector de empuje
                const dir = new THREE.Vector3().subVectors(player.model.position, enemy.model.position).normalize();
                
                // Empujamos a ambos personajes en direcciones opuestas
                player.model.position.addScaledVector(dir, overlap * 0.5);
                enemy.model.position.addScaledVector(dir, -overlap * 0.5);
            }
        }

        // =====================================================
        // LÓGICA DE IMPACTOS
        // =====================================================
        function checkHits() {
            if (!gameStarted || !player.model || !enemy.model) return;
            evaluateHit(player, enemy);
            evaluateHit(enemy, player);
        }

        function evaluateHit(attacker, defender) {
            // Si no está atacando, si ya dio el golpe, o si alguien está reaccionando a un impacto, salimos
            if (!attacker.currentPunch || attacker.hasHit || attacker.isHit || defender.isHit) return;

            const action = attacker.actions[attacker.currentPunch];
            if (!action) return;

            const progress = action.time / action.getClip().duration;

            // Ventana de impacto: evaluamos si colisiona justo cuando el brazo está estirado (30% al 50% de la anim)
            if (progress > 0.3 && progress < 0.5) {
                const dist = attacker.model.position.distanceTo(defender.model.position);
                const hitRange = 140; // Rango del brazo

                if (dist < hitRange) {
                    attacker.hasHit = true; // Registramos que ya pegó para que no haga daño doble
                    
                    if (punchSound && punchSound.buffer) {
                        if (punchSound.isPlaying) punchSound.stop();
                        punchSound.play();
                    }

                    // Aplicamos daño y animación al defensor
                    triggerHitReaction(defender, punchTypes[attacker.currentPunch] || 'head');
                }
            }
        }

        function triggerHitReaction(character, type) {
            character.isHit = true;
            character.isMoving = false;
            character.isComboing = false;
            character.comboQueue = []; 
            character.currentPunch = null;
            character.moveData = null;

            const animName = (type === 'body') ? 'hitBody' : 'hitHead';
            const action = character.actions[animName];

            if (action) {
                switchAction(character, action, 0.1);
            }
        }

        function updateFacing() {
            if ( !player.model || !enemy.model ) return;

            const dx = enemy.model.position.x - player.model.position.x;
            const dz = enemy.model.position.z - player.model.position.z;

            const anglePlayerToEnemy = Math.atan2(dx, dz);
            const angleEnemyToPlayer = Math.atan2(-dx, -dz);

            player.model.rotation.y = anglePlayerToEnemy;
            enemy.model.rotation.y = angleEnemyToPlayer;
        }


        function updateAI() {

            if ( !enemy.model || !player.model ) return;
            if ( !enemy.actions.fightIdle ) return;
            if ( enemy.activeAction === enemy.actions.readyIdle ) return;
            if ( enemy.activeAction === enemy.actions.standingToFight ) return;
            if ( enemy.isMoving || enemy.isComboing || enemy.isHit || player.isHit ) return;

            const distance = player.model.position.distanceTo( enemy.model.position );
            const idealDistance = 150;

            const now = performance.now();

            if ( distance > idealDistance + 35 ) {

                playBoxAction( enemy, 'mediumForward' );

            } else if ( distance < idealDistance - 35 ) {

                playBoxAction( enemy, 'shortBackward' );

            } else {

                if ( now > enemy.nextAttackTime ) {

                    startEnemyCombo();

                    enemy.nextAttackTime = now + 1600 + Math.random() * 1400;

                } else {

                    playFightIdle( enemy );

                }

            }

        }
        
        // --- LÓGICA DINÁMICA DE CÁMARA (ACTUALIZADA) ---
        function updateCamera() {
            if ( !player.model || !enemy.model ) return;

            if ( cameraMode === 1 ) {
                // Dirección del jugador hacia el enemigo
                const dx = enemy.model.position.x - player.model.position.x;
                const dz = enemy.model.position.z - player.model.position.z;
                const dir = new THREE.Vector3(dx, 0, dz).normalize();

                // Punto medio exacto entre los dos peleadores
                const midPoint = new THREE.Vector3().addVectors(player.model.position, enemy.model.position).multiplyScalar(0.5);

                // Posición ideal: Muy arriba (camHeightMode1) y retraída en la línea de visión (camDistMode1)
                idealPos.copy(player.model.position)
                        .addScaledVector(dir, -camDistMode1)
                        .add(new THREE.Vector3(0, camHeightMode1, 0));
                
                // Mover cámara a la nueva posición
                camera.position.lerp(idealPos, 0.1);

                // Mirar al punto central entre ambos combatientes, no al horizonte
                idealLookAt.copy(midPoint).add(new THREE.Vector3(0, 40, 0)); // Enfocado a la altura del pecho/cintura central
                currentLookAt.lerp(idealLookAt, 0.1);
                camera.lookAt(currentLookAt);

            } else if ( cameraMode === 2 ) {
                // Modo Libre: La cámara sigue orbitando, apuntando al punto medio
                const midPoint = new THREE.Vector3().addVectors(player.model.position, enemy.model.position).multiplyScalar(0.5);
                midPoint.y = 90; 
                
                controls.target.lerp(midPoint, 0.1);
                controls.update();
            }
        }

        function onMouseWheel( event ) {
            if ( cameraMode === 1 ) {
                camDistMode1 += event.deltaY * 0.1;
                camDistMode1 = THREE.MathUtils.clamp( camDistMode1, minCamDist1, maxCamDist1 );
            }
        }

        function onKeyDown( event ) {
            if ( event.key === '1' ) {
                cameraMode = 1;
                controls.enabled = false;
                return;
            }
            if ( event.key === '2' ) {
                cameraMode = 2;
                controls.enabled = true;
                return;
            }

            keysPressed[ event.key ] = true;
            if ( event.key === 'Shift' ) keysPressed[ 'Shift' ] = true;

            if ( ! player || ! player.actions.fightIdle ) return;
            if ( player.isMoving || player.isHit ) return;

            const shift = event.shiftKey;

            switch ( event.code ) {

                // GOLPES
                case 'KeyA':
                    event.preventDefault();
                    playPunchAction( player, shift ? 'leadJabShift' : 'leadJab' );
                    break;

                case 'KeyW':
                    event.preventDefault();
                    playPunchAction( player, shift ? 'uppercut' : 'jabCross' );
                    break;

                case 'KeyS':
                    event.preventDefault();
                    playPunchAction( player, shift ? 'hookShift' : 'hook' );
                    break;

                case 'KeyD':
                    event.preventDefault();
                    playPunchAction( player, shift ? 'bodyJabCrossShift' : 'bodyJabCross' );
                    break;

                // MOVIMIENTO
                case 'ArrowUp':
                    event.preventDefault();
                    playBoxAction( player, shift ? 'mediumForward' : 'shortForward' );
                    break;

                case 'ArrowDown':
                    event.preventDefault();
                    playBoxAction( player, shift ? 'mediumBackward' : 'shortBackward' );
                    break;

                case 'ArrowLeft':
                    event.preventDefault();
                    playBoxAction( player, shift ? 'mediumLeft' : 'shortLeft' );
                    break;

                case 'ArrowRight':
                    event.preventDefault();
                    playBoxAction( player, shift ? 'mediumRight' : 'shortRight' );
                    break;

            }

        }

        function onKeyUp( event ) {
            keysPressed[ event.key ] = false;
            if ( event.key === 'Shift' ) keysPressed[ 'Shift' ] = false;
        }

        function checkAndPlayMovement() {
            const medium = keysPressed[ 'Shift' ];

            if ( keysPressed[ 'ArrowUp' ] ) {
                playBoxAction( player, medium ? 'mediumForward' : 'shortForward' );
            } else if ( keysPressed[ 'ArrowDown' ] ) {
                playBoxAction( player, medium ? 'mediumBackward' : 'shortBackward' );
            } else if ( keysPressed[ 'ArrowLeft' ] ) {
                playBoxAction( player, medium ? 'mediumLeft' : 'shortLeft' );
            } else if ( keysPressed[ 'ArrowRight' ] ) {
                playBoxAction( player, medium ? 'mediumRight' : 'shortRight' );
            } else {
                playFightIdle( player );
            }
        }

        function checkAndPlayPunch() {

            const shift = keysPressed[ 'Shift' ];

            if ( keysPressed[ 'a' ] || keysPressed[ 'A' ] ) {
                playPunchAction( player, shift ? 'leadJabShift' : 'leadJab' );
                return;
            }

            if ( keysPressed[ 'w' ] || keysPressed[ 'W' ] ) {
                playPunchAction( player, shift ? 'uppercut' : 'jabCross' );
                return;
            }

            if ( keysPressed[ 's' ] || keysPressed[ 'S' ] ) {
                playPunchAction( player, shift ? 'hookShift' : 'hook' );
                return;
            }

            if ( keysPressed[ 'd' ] || keysPressed[ 'D' ] ) {
                playPunchAction( player, shift ? 'bodyJabCrossShift' : 'bodyJabCross' );
                return;
            }

        }

        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize( window.innerWidth, window.innerHeight );
        }

        function animate() {
            timer.update();
            const delta = timer.getDelta();

            if ( player.mixer ) player.mixer.update( delta );
            if ( enemy.mixer ) enemy.mixer.update( delta );

            // 🚫 NO hacer nada hasta iniciar pelea
            if (!gameStarted) {
                renderer.render(scene, camera);
                stats.update();
                return;
            }

            updateFacing();

            updateStepMovement( player, delta );
            updateStepMovement( enemy, delta );

            // Sistemas de Físicas e Impactos
            resolveBodyCollisions();
            checkHits();

            updateAI(); 
            
            updateCamera();

            renderer.render( scene, camera );
            stats.update();
        }