/**
 *  The charts editor holds the tabs for selecting chart types, chart configuration
 *  and data group selections.
 */
define( [ 'mvc/ui/ui-tabs', 'mvc/ui/ui-misc', 'mvc/ui/ui-portlet', 'utils/utils',
          'plugin/models/chart', 'plugin/models/group',
          'plugin/views/group', 'plugin/views/settings', 'plugin/views/types' ],
    function( Tabs, Ui, Portlet, Utils, Chart, Group, GroupView, SettingsView, TypesView ) {
    return Backbone.View.extend({
        initialize: function( app, options ){
            var self = this;
            this.app = app;
            this.chart = this.app.chart;
            this.message = new Ui.Message();
            this.portlet = new Portlet.View({
                icon : 'fa-bar-chart-o',
                title: 'Editor',
                operations      : {
                    'save'  : new Ui.ButtonIcon({
                        icon    : 'fa-save',
                        tooltip : 'Draw Chart',
                        title   : 'Draw',
                        onclick : function() {
                            self._saveChart();
                        }
                    }),
                    'back'  : new Ui.ButtonIcon({
                        icon    : 'fa-caret-left',
                        tooltip : 'Return to Viewer',
                        title   : 'Cancel',
                        onclick : function() {
                            self.app.go( 'viewer' );
                            self.app.storage.load();
                        }
                    })
                }
            });

            // grid with chart types
            this.types = new TypesView(app, {
                onchange   : function(chart_type) {
                    var chart_definition = self.app.types.get( chart_type );
                    if ( !chart_definition ) {
                        console.debug('FAILED - Editor::onchange() - Chart type not supported.');
                    }
                    self.chart.definition = chart_definition;
                    self.chart.settings.clear();
                    self.chart.set( { type : chart_type, modified : true } );
                    console.debug( 'Editor::onchange() - Switched chart type.' );
                },
                ondblclick  : function( chart_id ) {
                    self._saveChart();
                }
            });

            // tab view
            this.tabs = new Tabs.View({
                title_new       : 'Add Data',
                onnew           : function() {
                    var group = self._addGroupModel();
                    self.tabs.show( group.id );
                }
            });

            // start tab
            this.title = new Ui.Input({
                placeholder: 'Chart title',
                onchange: function() {
                    self.chart.set( 'title', self.title.value() );
                }
            });
            this.tabs.add({
                id      : 'main',
                title   : 'Start',
                $el     : $( '<div/>' ).append( ( new Ui.Label( { title : 'Provide a chart title:' } ).$el ) )
                                       .append( this.title.$el )
                                       .append( $( '<div/>' ).addClass( 'ui-form-info' ).html( 'This title will appear in the list of \'Saved Visualizations\'. Charts are saved upon creation.' ) )
                                       .append( this.types.$el.addClass( 'ui-margin-top' ) )
            });

            // settings tab
            this.settings = new SettingsView( this.app );
            this.tabs.add({
                id      : 'settings',
                title   : 'Configuration',
                $el     : this.settings.$el
            });

            // set elements
            this.portlet.append( this.message.$el.addClass( 'ui-margin-top' ) );
            this.portlet.append( this.tabs.$el.addClass( 'ui-margin-top' ) );
            this.setElement( this.portlet.$el );
            this.tabs.hideOperation( 'back' );

            // chart events
            this.chart.on( 'change:title', function( chart ) { self._refreshTitle() } );
            this.chart.on( 'change:type', function( chart ) { self.types.value( chart.get( 'type' ) ) } );
            this.chart.on( 'reset', function( chart ) { self._resetChart() } );
            this.app.chart.on( 'redraw', function( chart ) { self.portlet.showOperation( 'back' ) } );
            this.app.chart.groups.on( 'add', function( group ) { self._addGroup( group ) } );
            this.app.chart.groups.on('remove', function( group ) { self._removeGroup(group) } );
            this.app.chart.groups.on( 'reset', function( group ) { self._removeAllGroups() } );
            this.app.chart.groups.on( 'change:key', function( group ) { self._refreshGroupKey() } );
            this._resetChart();
        },

        /** Show editor */
        show: function() {
            this.$el.show();
        },

        /** Hide editor */
        hide: function() {
            this.$el.hide();
        },

        /** Refresh title handler */
        _refreshTitle: function() {
            var title = this.chart.get( 'title' );
            this.portlet.title( title );
            if ( this.title.value() != title ) {
                this.title.value( title );
            }
        },

        /** Refresh group handler */
        _refreshGroupKey: function() {
            var self = this;
            var counter = 0;
            this.chart.groups.each( function( group ) {
                var title = group.get( 'key', '' );
                self.tabs.title( group.id, ++counter + ': ' + ( title == '' ? 'Data label' : title ) );
            });
        },
        
        /** Add group model */
        _addGroupModel: function() {
            var group = new Group( { id : Utils.uid() } );
            this.chart.groups.add( group );
            return group;
        },

        /** Add group tab */
        _addGroup: function( group ) {
            var self = this;
            var group_view = new GroupView( this.app, { group: group } );
            this.tabs.add({
                id              : group.id,
                $el             : group_view.$el,
                ondel           : function() { self.chart.groups.remove( group.id ) }
            });
            this._refreshGroupKey();
            this.chart.set( 'modified', true );
        },

        /** Remove group */
        _removeGroup: function( group ) {
            this.tabs.del( group.id );
            this._refreshGroupKey();
            this.chart.set( 'modified', true );
        },

        /** Remove all groups */
        _removeAllGroups: function( group ) {
            this.tabs.delRemovable();
        },

        /** Reset entire chart */
        _resetChart: function() {
            this.chart.set({
                'id'            : Utils.uid(),
                'type'          : 'nvd3_bar',
                'dataset_id'    : this.app.options.config.dataset_id,
                'title'         : 'New Chart'
            });
            this.portlet.hideOperation( 'back' );
        },

        /** Save chart data */
        _saveChart: function() {
            var self = this;
            this.chart.set({
                type        : this.types.value(),
                title       : this.title.value(),
                date        : Utils.time()
            });
            if ( this.chart.groups.length == 0 ) {
                this.message.update( { message: 'Please select data columns before drawing the chart.' } );
                var group = this._addGroupModel();
                this.tabs.show( group.id );
                return;
            }
            var valid = true;
            var chart_def = this.chart.definition;
            this.chart.groups.each( function( group ) {
                if ( valid ) {
                    for ( var key in chart_def.columns ) {
                        if ( group.attributes[ key ] === '__null__' ) {
                            self.message.update( { status: 'danger', message: 'This chart type requires column types not found in your tabular file.' } );
                            self.tabs.show( group.id );
                            valid = false;
                        }
                    }
                }
            });
            if ( valid ) {
                this.app.go( 'viewer' );
                this.app.deferred.execute( function() {
                    self.app.storage.save();
                    self.chart.trigger( 'redraw' );
                });
            }
        }
    });
});