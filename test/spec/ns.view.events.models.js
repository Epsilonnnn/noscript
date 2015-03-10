describe('ns.View. Подписка на события моделей.', function() {

    beforeEach(function() {
        ns.Model.define('elements');
        ns.Model.get('elements').setData({water: true, fire: true, ground: true, air: true});

        ns.Model.define('season');
        ns.Model.get('season').setData({name: 'summer', year: 2023});

        ns.Model.define('person', {params: {id: true}});

        ns.Model.define('community', {
            split: {
                model_id: 'person',
                items: '.person',
                params: {id: '.id'}
            }
        });
        ns.Model.get('community').setData({person: [
            {id: 1, name: 'Kirk Hammett'}, {id: 2, name: 'Michael Peter Balzary'}, {id: 3, name: 'Marty Friedman'}
        ]});

        ns.View.define('app');
        this.viewApp = ns.View.create('app');

        this.assertViewsValid = function() {
            Array.prototype.slice.apply(arguments).forEach(function(idView) {
                expect(this.viewApp.views[idView].isValid()).to.equal(true);
            }.bind(this));
        };

        this.assertViewsInvalid = function() {
            Array.prototype.slice.apply(arguments).forEach(function(idView) {
                expect(this.viewApp.views[idView].isValid()).to.equal(false);
            }.bind(this));
        };

        this.assertCountCall = function(count) {
            Array.prototype.slice.call(arguments, 1, arguments.length).forEach(function(spy) {
                expect(spy.callCount).to.equal(count);
            }.bind(this));
        };
    });

    describe('Декларация ->', function() {

        it('должен бросить исключение, если не найден обработчик событий модели', function() {
            ns.log.exception.restore();
            // блокируем вывод ошибок, он нам не нужен
            this.sinon.stub(ns.log, 'exception');
            this.sinon.spy(ns.View, 'assert');

            ns.Model.define('superModel');
            ns.Model.get('superModel').setData({});

            ns.View.define('myView', {
                models: {
                    superModel: 'iDoNotExistButNobodyCares'
                }
            });

            var view = ns.View.create('myView');
            return view.update().then(function() {
                return Vow.reject('resolved');
            }, function() {
                expect(ns.View.assert).to.be.calledWith(false, 4);
                return Vow.resolve();
            });
        });

    });

    describe('Игнорирование событий модели ("keepValid" | false).', function() {

        beforeEach(function(done) {
            ns.layout.define('app', {
                app: {
                    universe: true,
                    infinity: true,
                    gravity: true,
                    timeflow: true
                }
            });
            ns.View.define('universe', { // Вселенная существует независимо от моделей
                models: {
                    elements: false,
                    season: false,
                    community: false
                }
            });
            ns.View.define('infinity', { // Бесконечность существует независимо от моделей
                models: {
                    elements: 'keepValid',
                    season: 'keepValid',
                    community: 'keepValid'
                }
            });
            ns.View.define('gravity', { // Гравитация существует независимо от моделей
                models: {
                    season: {
                        'ns-model-changed': false,
                        'ns-model-destroyed': false
                    },
                    community: {
                        'ns-model-insert': false,
                        'ns-model-remove': false
                    }
                }
            });
            ns.View.define('timeflow', { // Время течёт независимо от моделей
                models: {
                    season: {
                        'ns-model-changed': 'keepValid',
                        'ns-model-destroyed': 'keepValid'
                    },
                    community: {
                        'ns-model-insert': 'keepValid',
                        'ns-model-remove': 'keepValid'
                    }
                }
            });

            new ns.Update(this.viewApp, ns.layout.page('app', {}), {})
                .start()
                .done(function() {done();});
        });

        it('До изменений виды должны быть валидными', function() {
            this.assertViewsValid('universe', 'infinity', 'gravity', 'timeflow');
        });

        it('После ns-model-changed виды должны остаться валидными', function() {
            ns.Model.get('season').setData({name: 'winter', year: 2024});
            this.assertViewsValid('universe', 'infinity', 'gravity', 'timeflow');
        });

        it('После ns-model-changed{jpath} виды должны остаться валидными', function() {
            ns.Model.get('season').set('.name', 'winter');

            this.assertViewsValid('universe', 'infinity', 'gravity', 'timeflow');
        });

        it('После ns-model-insert виды должны остаться валидными', function() {
            var person = ns.Model.get('person', {id: 4});
            person.setData({id: 4, name: 'Brian May'});
            ns.Model.get('community').insert(person);
            this.assertViewsValid('universe', 'infinity', 'gravity', 'timeflow');
        });

        it('После ns-model-remove виды должны остаться валидными', function() {
            ns.Model.get('community').remove(ns.Model.get('person', {id: 3}));
            this.assertViewsValid('universe', 'infinity', 'gravity', 'timeflow');
        });

        it('После ns-model-destroyed виды должны стать невалидными', function() {
            ns.Model.destroy(ns.Model.get('season'));
            this.assertViewsInvalid('universe', 'infinity', 'gravity', 'timeflow');
        });

    });

    describe('Игнорирование событий одной модели не влияет на другую.', function() {

        beforeEach(function() {

            ns.layout.define('app1', {
                app: {
                    variable: {}
                }
            });

            ns.View.define('variable', {
                models: {
                    elements: false,
                    season: true
                }
            });
            this.view = ns.View.create('variable');

            return new ns.Update(this.viewApp, ns.layout.page('app1', {}), {}).render();
        });

        it('До изменений виды должны быть валидными', function() {
            this.assertViewsValid('variable');
        });

        it('При изменении игнорируемой модели вид должен остаться валидными', function() {
            ns.Model.get('elements').setData('true');
            this.assertViewsValid('variable');
        });

        it('При изменении неигнорируемой модели вид должен стать невалидными', function() {
            ns.Model.get('season').setData('true');
            this.assertViewsInvalid('variable');
        });

        it('При изменении игнорируемой и неигнорируемой моделей вид должен стать невалидными', function() {
            // изменяем версию модели, это сделает вид невалидным, потому что не совпадет версия
            ns.Model.get('season').touch();
            // теперь меняем данные у игнорируемой модели, это вызывает keepValid (синхронизацию версий)
            // если keepValid синхронизирует только свою версию, то вид так и останется невалидным (ОК)
            // если keepValid синхронизирует версии всех моделей, то вид станет валидным, а не должен (FAIL)
            ns.Model.get('elements').setData('true');
            this.assertViewsInvalid('variable');
        });

    });

    describe('Безусловная инвалидация вида ("invalidate" | true).', function() {

        beforeEach(function(done) {
            ns.layout.define('app', {
                app: {
                    evolution: true,
                    policy: true,
                    sales: true,
                    weather: true
                }
            });

            ns.View.define('evolution', { // Эволюция происходит под действием моделей
                models: {
                    elements: true,
                    season: true,
                    community: true
                }
            });
            ns.View.define('policy', { // Политика зависит от моделей
                models: {
                    elements: 'invalidate',
                    season: 'invalidate',
                    community: 'invalidate'
                }
            });
            ns.View.define('sales', { // Продажи зависят от моделей
                models: {
                    season: {
                        'ns-model-changed': true,
                        'ns-model-destroyed': true
                    },
                    community: {
                        'ns-model-insert': true,
                        'ns-model-remove': true
                    }
                }
            });
            ns.View.define('weather', { // Погода зависит от моделей
                models: {
                    season: {
                        'ns-model-changed': 'invalidate',
                        'ns-model-destroyed': 'invalidate'
                    },
                    community: {
                        'ns-model-insert': 'invalidate',
                        'ns-model-remove': 'invalidate'
                    }
                }
            });

            new ns.Update(this.viewApp, ns.layout.page('app', {}), {})
                .start()
                .done(function() {done();});

        });

        it('До изменений виды должны быть валидными', function() {
            this.assertViewsValid('evolution', 'policy', 'sales', 'weather');
        });

        it('После ns-model-changed виды должны стать невалидными', function() {
            ns.Model.get('season').setData({name: 'winter', year: 2024});

            this.assertViewsInvalid('evolution', 'policy', 'sales', 'weather');
        });

        it('После ns-model-changed{jpath} виды должны стать невалидными', function() {
            ns.Model.get('season').set('.name', 'winter');

            this.assertViewsInvalid('evolution', 'policy', 'sales', 'weather');
        });

        it('После ns-model-insert виды должны стать невалидными', function() {
            var person = ns.Model.get('person', {id: 4});
            person.setData({id: 4, name: 'Brian May'});
            ns.Model.get('community').insert(person);
            this.assertViewsInvalid('evolution', 'policy', 'sales', 'weather');
        });

        it('После ns-model-remove виды должны стать невалидными', function() {
            ns.Model.get('community').remove(ns.Model.get('person', {id: 3}));
            this.assertViewsInvalid('evolution', 'policy', 'sales', 'weather');
        });

        it('После ns-model-destroyed виды должны стать невалидными', function() {
            ns.Model.destroy(ns.Model.get('season'));
            this.assertViewsInvalid('evolution', 'policy', 'sales', 'weather');
        });

    });

    describe('Подписка методов вида на события модели.', function() {

        beforeEach(function(done) {
            ns.layout.define('app', {
                app: {
                    weather: true,
                    climate: true
                }
            });

            var justDo = function() {
                // сотворитьДобро();
            };

            ns.View.define('weather', { // Погода зависит от моделей
                models: {
                    season: {
                        'ns-model-changed': 'onChanged',
                        'ns-model-changed.name': 'onChangedJpath',
                        'ns-model-destroyed': 'onDestroyed'
                    },
                    community: {
                        'ns-model-insert': 'onInsert',
                        'ns-model-remove': 'onRemove'
                    }
                },
                methods: {
                    onChanged: this.onChanged = sinon.spy(justDo),
                    onChangedJpath: this.onChangedJpath = sinon.spy(justDo),
                    onInsert:  this.onInsert  = sinon.spy(justDo),
                    onRemove:  this.onRemove  = sinon.spy(justDo),
                    onDestroyed: this.onDestroyed = sinon.spy(justDo)
                }
            });

            var doThingAndInvalidate = function() {
                // сотворитьДобро();
                this.invalidate();
            };

            ns.View.define('climate', { // Климат зависит от моделей
                models: {
                    season: {
                        'ns-model-changed': 'onChanged',
                        'ns-model-changed.name': 'onChangedJpath',
                        'ns-model-destroyed': 'onDestroyed'
                    },
                    community: {
                        'ns-model-insert': 'onInsert',
                        'ns-model-remove': 'onRemove'
                    }
                },
                methods: {
                    onChanged: this.invalidateOnChanged = sinon.spy(doThingAndInvalidate),
                    onChangedJpath: this.invalidateOnChangedJpath = sinon.spy(doThingAndInvalidate),
                    onInsert:  this.invalidateOnInsert  = sinon.spy(doThingAndInvalidate),
                    onRemove:  this.invalidateOnRemove  = sinon.spy(doThingAndInvalidate),
                    onDestroyed: this.onDestroyed
                }
            });

            new ns.Update(this.viewApp, ns.layout.page('app', {}), {})
                .start()
                .done(function() {done();});

        });

        describe('При ns-model-changed', function() {

            beforeEach(function() {
                ns.Model.get('season').setData({name: 'winter', year: 2024});
            });

            it('должны быть однократно вызваны его обработчики', function() {
                this.assertCountCall(1, this.onChanged, this.invalidateOnChanged);
            });

            it('обработчики других событий не должны быть вызваны ни разу', function() {
                this.assertCountCall(0,
                    this.onChangedJpath, this.onInsert, this.onRemove,
                    this.invalidateOnChangedJpath, this.invalidateOnInsert, this.invalidateOnRemove, this.onDestroyed
                );
            });

            it('неинвалидирующие обработчики должны оставить свой вид валидным', function() {
                this.assertViewsValid('weather');
            });

            it('инвалидирующие обработчики должны инвалидировать свой вид', function() {
                this.assertViewsInvalid('climate');
            });

        });

        describe('При ns-model-changed{jpath}', function() {

            beforeEach(function() {
                ns.Model.get('season').set('.name', 'winter');
            });

            it('должны быть однократно вызваны его обработчики', function() {
                this.assertCountCall(1, this.onChangedJpath, this.invalidateOnChangedJpath);
            });

            it('должны быть однократно вызваны обработчики ns-model-changed', function() {
                this.assertCountCall(1, this.onChanged, this.invalidateOnChanged);
            });

            it('обработчики других событий не должны быть вызваны ни разу', function() {
                this.assertCountCall(0,
                    this.onInsert, this.onRemove,
                    this.invalidateOnInsert, this.invalidateOnRemove, this.onDestroyed
                );
            });

            it('неинвалидирующие обработчики должны оставить свой вид валидным', function() {
                this.assertViewsValid('weather');
            });

            it('инвалидирующие обработчики должны инвалидировать свой вид', function() {
                this.assertViewsInvalid('climate');
            });

        });

        describe('При ns-model-insert', function() {

            beforeEach(function() {
                var person = ns.Model.get('person', {id: 4});
                person.setData({id: 4, name: 'Brian May'});
                ns.Model.get('community').insert(person);
            });

            it('должны быть однократно вызваны его обработчики', function() {
                this.assertCountCall(1, this.onInsert, this.invalidateOnInsert);
            });

            it('обработчики других событий не должны быть вызваны ни разу', function() {
                this.assertCountCall(0,
                    this.onChanged, this.onChangedJpath, this.onRemove,
                    this.invalidateOnChanged, this.invalidateOnChangedJpath, this.invalidateOnRemove, this.onDestroyed
                );
            });

            it('неинвалидирующие обработчики должны оставить свой вид валидным', function() {
                this.assertViewsValid('weather');
            });

            it('инвалидирующие обработчики должны инвалидировать свой вид', function() {
                this.assertViewsInvalid('climate');
            });

        });

        describe('При ns-model-remove', function() {

            beforeEach(function() {
                ns.Model.get('community').remove(ns.Model.get('person', {id: 3}));
            });

            it('должны быть однократно вызваны соответствующие ему методы', function() {
                this.assertCountCall(1, this.onRemove, this.invalidateOnRemove);
            });

            it('методы, соответствующие другим событиям не должны быть вызваны ни разу', function() {
                this.assertCountCall(0,
                    this.onChanged, this.onChangedJpath, this.onInsert,
                    this.invalidateOnChanged, this.invalidateOnChangedJpath, this.invalidateOnInsert, this.onDestroyed
                );
            });

            it('неинвалидирующие методы должны оставить свой вид валидным', function() {
                this.assertViewsValid('weather');
            });

            it('инвалидирующие методы должны инвалидировать свой вид', function() {
                this.assertViewsInvalid('climate');
            });

        });

        describe('При ns-model-destroyed', function() {

            beforeEach(function() {
                ns.Model.destroy(ns.Model.get('season'));
            });

            it('должны быть однократно вызваны его обработчики', function() {
                this.assertCountCall(2, this.onDestroyed);
            });

            it('обработчики других событий не должны быть вызваны ни разу', function() {
                this.assertCountCall(0,
                    this.onChanged, this.onChangedJpath, this.onInsert, this.onRemove,
                    this.invalidateOnChanged, this.invalidateOnChangedJpath, this.invalidateOnInsert, this.invalidateOnRemove
                );
            });
        });

    });

});
